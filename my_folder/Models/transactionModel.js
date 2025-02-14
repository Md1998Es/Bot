const { default: mongoose } = require("mongoose");

const TransactionSchema = new mongoose.Schema({
    order_id: {
        type: String,
        required: true,
        unique: true,
    },
    uuid: {
        type: Number,
        required: true,
    },
    ref_num: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    payment_amount: {
        type: Number,
        required: true,
    },
    trx_amount: {
        type: Number,
        required: true,
    },
    wallet: {
        type: String,
        required: true,
    },
    url: {
        type: String,
        required: false,
    },
    status: {
        type: Boolean,
        required: false,
        default: false,
    },
    Date: {
        type: Date,
        required: true,
    },
});

module.exports = mongoose.model(
    "Transaction",
    TransactionSchema,
    "Transactions"
);
