const axios = require("axios");

const ZIBAL_MERCHANT = "675e77926f3803001275690e";  // مرچنت کد زیبال
const CALLBACK_URL = "https://YOUR_DOMAIN.com/callback";  // آدرس بازگشت بعد از پرداخت

// ایجاد تراکنش
async function createTransaction(amount, orderId) {
    try {
        const response = await axios.post("https://api.zibal.ir/v1/request", {
            merchant: ZIBAL_MERCHANT,
            amount: amount,
            callbackUrl: CALLBACK_URL,
            orderId: orderId
        });

        if (response.data.result === 100) {
            return { success: true, trackId: response.data.trackId };
        } else {
            return { success: false, message: response.data.message };
        }
    } catch (error) {
        return { success: false, message: "خطا در اتصال به زیبال" };
    }
}

// بررسی وضعیت پرداخت
async function verifyTransaction(trackId) {
    try {
        const response = await axios.post("https://api.zibal.ir/v1/verify", {
            merchant: ZIBAL_MERCHANT,
            trackId: trackId
        });

        if (response.data.result === 100) {
            return { success: true, paid: response.data.paidAt };
        } else {
            return { success: false, message: response.data.message };
        }
    } catch (error) {
        return { success: false, message: "خطا در بررسی پرداخت زیبال" };
    }
}

module.exports = { createTransaction, verifyTransaction };
