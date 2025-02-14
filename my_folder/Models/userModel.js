const { default: mongoose } = require("mongoose");

const UserSchema = new mongoose.Schema({
    uuid: {
        type: Number,
        required: true,
        unique: true,
    },
    transactions: {
        type: Array,
        required: false,
        default: [],
    },
    isBanned: {
        type: Boolean,
        requried: false,
        default: false,
    },
    // national_code: {
    //     type: Number,
    //     required: true,
    //     unique: true,
    // },
    card_number: {
        type: String,
        required: true,
    },
    phone_number: {
        type: String,
        required: true,
    },
    status: {
        type: Boolean,
        required: false,
        default: false,
    },
});

module.exports = mongoose.model("User", UserSchema, "Users");
