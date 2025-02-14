// 5694340188

const express = require("express");
const app = express();
const Paystar = require("./Gateways/zibal");
const userModel = require("./Models/userModel");
const transactionModel = require("./Models/transactionModel");
const bot = require("./bot");
const config = require("./config.json");
const TronWeb = require("tronweb");
const { privateKey } = TronWeb.fromMnemonic(config.wallet);
const tronWeb = new TronWeb({
    fullHost: "https://api.trongrid.io",
    headers: { "TRON-PRO-API-KEY": "beb5510a-87ca-465e-8808-afced07fcaaa" },
    privateKey: privateKey.slice(2),
});
app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs")

// app.get("/tron/", (req, res) => {
//    res.send("We are up!");
// });

// app.get("/", (req, res) => {
//     res.sendFile(__dirname + "/views/home.html");
// });

app.get("/tron/", async (req, res) => {
    try {
        if (req.query.status != 1) {
            console.log(req.body);
            res.render("done", { status: false });
            return;
        }
        const { uuid } = req.query;
        const { order_id, ref_num, card_number, tracking_code } = req.query;
        const transaction = await transactionModel.findOne({ order_id });
        const gateway = await new Paystar().verify(
            transaction.amount,
            ref_num,
            card_number,
            tracking_code
        );
        if (gateway.status != 1) {
            console.log(gateway);
            res.render("done", { status: false });
            return;
        }
        const user = await userModel.findOne({ uuid });
        user.transactions.push(transaction.order_id);
        await user.save();
        const signed = await tronWeb.trx.sendTransaction(
            transaction.wallet,
            tronWeb.toSun(transaction.trx_amount),
            privateKey.slice(2)
        );
        transaction.status = true;
        transaction.url = `https://tronscan.org/#/transaction/${signed.txid}`;
        await transaction.save();
        bot.telegram.sendMessage(
            uuid,
            `✅ پرداخت موفق بود. مبلغ ${transaction.trx_amount} ترون به آدرس ${transaction.wallet} واریز شد.

🔗 https://tronscan.org/#/transaction/${signed.txid}

ℹ️ کد رهگیری: ${transaction.order_id}`
        );
        bot.telegram.sendMessage(
            config.admin,
            `ℹ️ کاربر با آیدی عددی ${transaction.uuid} تعداد ${
                transaction.trx_amount
            } ترون به مبلغ ${(
                transaction.amount / 10
            ).toLocaleString()} برای ولت ${transaction.wallet} خریداری کرد.


🔗 https://tronscan.org/#/transaction/${signed.txid}

ℹ️ کد رهگیری: ${transaction.order_id}`
        );
        res.render("done", {
            status: true,
            order_id,
            amount: transaction.amount,
            trx_amount: transaction.trx_amount,
            wallet: transaction.wallet,
            tracking_code,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            status: false,
            error: `${error}`
        })
    }
});

// app.get("/tron/", (req, res) => {
//     res.send("Please use POST method")
// });

module.exports = app;
