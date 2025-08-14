"use strict";

const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");
const https = require("https");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

axios.defaults.timeout = 5000;

class SofarCloud extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: "sofarcloud",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    async onReady() {
        // Konfiguration aus Adapter-Settings
        const username = this.config.username || "";
        const password = this.config.passwort || "";
        const broker_address = this.config.broker_address || "";
        const mqtt_active = !!this.config.mqtt_active;
        const mqtt_user = this.config.mqtt_user || "";
        const mqtt_pass = this.config.mqtt_pass || "";
        const mqtt_port = Number(this.config.mqtt_port) || 1883;
        const storeJson = !!this.config.storeJson;
        const storeDir = this.config.storeDir || "";

        let client = null;
        if (mqtt_active) {
            if (!broker_address || broker_address === "0.0.0.0") {
                this.log.error("MQTT IP address is empty - please check instance configuration");
                this.terminate ? this.terminate("MQTT IP address is empty", 0) : process.exit(0);
                return;
            }
            client = mqtt.connect(`mqtt://${broker_address}:${mqtt_port}`, {
                connectTimeout: 4000,
                username: mqtt_user,
                password: mqtt_pass,
            });
        }

        try {
            const token = await this.loginSofarCloud(username, password);
            if (!token) {
                this.log.error("No token received");
                if (client) client.end();
                return;
            }

            const daten = await this.getSofarStationData(token);
            if (!daten) {
                this.log.error("No data received");
                if (client) client.end();
                return;
            }

            if (storeJson) {
                this.saveJsonFile("sofar_realtime.json", daten, storeDir);
            }

            this.log.debug(JSON.stringify(daten, null, 2));

            if (mqtt_active && client) {
                await this.publishSofarData(client, daten);
                client.end();
            }

        } catch (err) {
            this.log.error("Error in the process: " + err.message);
        } finally {
            this.terminate ? this.terminate("Everything done. Going to terminate till next schedule", 0) : process.exit(0);
        }
    }

    // Login bei SofarCloud
    async loginSofarCloud(username, password) {
        const LOGIN_URL = "https://global.sofarcloud.com/api/user/auth/he/login";
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "okhttp/3.14.9"
        };
        const payload = {
            accountName: username,
            expireTime: 2592000,
            password: password
        };
        try {
            const response = await axios.post(LOGIN_URL, payload, { headers, httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
            this.log.debug(`Status code: ${response.status}`);
            this.log.debug(`Response: ${JSON.stringify(response.data)}`);
            if (response.status === 200) {
                const data = response.data;
                if (data.code === "0" && data.data && data.data.accessToken) {
                    this.log.debug("Login successful");
                    return data.data.accessToken;
                } else {
                    this.log.error("Login failed: " + data.message);
                }
            } else {
                this.log.error("Server error");
            }
        } catch (e) {
            this.log.error("Login error: " + e.message);
        }
        return null;
    }

    // Stationen abfragen
    async getSofarStationData(token) {
        const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const URL = "https://global.sofarcloud.com/api/";
        const headers = {
            "authorization": token,
            "app-version": "2.3.6",
            "custom-origin": "sofar",
            "custom-device-type": "1",
            "request-from": "app",
            "scene": "eu",
            "bundlefrom": "2",
            "appfrom": "6",
            "timezone": systemTimeZone,
            "accept-language": "en",
            "user-agent": "okhttp/4.9.2",
            "content-type": "application/json"
        };
        try {
            // Stationen-Liste holen
            const resp = await axios.post(URL + "device/stationInfo/selectStationListPages", { pageNum: 1, pageSize: 10 }, { headers });
            this.log.debug("Station list loaded");
            const stations = resp.data.data.rows;
            const allRealtime = [];
            for (const station of stations) {
                const station_id = station.id;
                const url_detail = `${URL}device/stationInfo/selectStationDetail?stationId=${station_id}`;
                const resp_detail = await axios.post(url_detail, {}, { headers });
                if (resp_detail.data && resp_detail.data.data && resp_detail.data.data.stationRealTimeVo) {
                    allRealtime.push(resp_detail.data.data.stationRealTimeVo);
                }
            }
            return allRealtime;
        } catch (e) {
            this.log.error("Error retrieving stations: " + e.message);
            return null;
        }
    }

    // MQTT Publish
    async sendMqttSofar(client, topic, value, station_id) {
        if (client) {
            const payload = value == null ? "" : value.toString();
            client.publish(`SofarCloud/${station_id}/${topic}`, payload, { qos: 0, retain: true });
        }
    }

    // JSON speichern
    saveJsonFile(filename, data, dir = "") {
        try {
            const filePath = path.join(dir || __dirname, filename);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
            this.log.debug(`JSON gespeichert: ${filePath}`);
        } catch (e) {
            this.log.error("Error saving JSON: " + e.message);
        }
    }

    // Daten durchlaufen und publishen
    async publishSofarData(client, daten) {
        for (let idx = 0; idx < daten.length; idx++) {
            const station = daten[idx];
            const station_id = station.id || `station${idx}`;
            for (const [key, value] of Object.entries(station)) {
                if (!key.toLowerCase().endsWith("unit")) {
                    await this.sendMqttSofar(client, key, value, station_id);
                }
            }
        }
    }

    onUnload(callback) {
        try {
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new SofarCloud(options);
} else {
    new SofarCloud();
}

