const { default: axios } = require("axios");
const crypto = require("crypto");
const config = require("../config.json");
const Axios = axios.create({
    baseURL: "https://core.paystar.ir/api/pardakht",
    timeout: 10000,
    headers: { Authorization: `Bearer ${config.gatewayId.paystar}` },
});

class Paystar {
    async create(amount, order_id, uuid, card_number) {
        const callback = `${config.host}/tron?uuid=${uuid}`;
        const result = (
            await Axios.post("/create", {
                Headers: {
                    Accept: "application/json",
                },
                amount,
                order_id,
                callback,
                callback_method: 1,
                card_number,
                sign: generateSignature(
                    config.encryptionKey.paystar,
                    `${amount}#${order_id}#${callback}`
                ),
            }).catch((error) => console.log(error))
        ).data;
        return {
            status: result.status,
            message: result.message,
            url: `https://core.paystar.ir/api/pardakht/payment?token=${result.data.token}`,
            data: result.data,
        };
    }

    async verify(amount, ref_num, card_number, tracking_code) {
        const result = (
            await Axios.post("/verify", {
                Headers: {
                    Accept: "application/json",
                    Authorization: "Bearer " + config.gatewayId.paystar,
                },
                ref_num,
                amount,
                sign: generateSignature(
                    config.encryptionKey.paystar,
                    `${amount}#${ref_num}#${card_number}#${tracking_code}`
                ),
            }).catch((error) => console.log(error))
        ).data;
        return result;
    }
}

module.exports = Paystar;

function generateSignature(apiKey, data) {
    const stringToSign = data.toString();
    const keyBuffer = Buffer.from(apiKey, "utf8");
    return crypto
        .createHmac("sha512", keyBuffer)
        .update(stringToSign)
        .digest("hex");
}
