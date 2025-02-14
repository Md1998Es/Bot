const { default: mongoose } = require("mongoose");

const WalletSchema = new mongoose.Schema({
    address: {
        type: String,
        requred: true,
    },
});

module.exports = mongoose.model("Wallet", WalletSchema, "Wallets");
