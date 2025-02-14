const app = require("./app");
const config = require("./config.json");
const bot = require("./bot");
const mongoose = require("mongoose");

const port = config.port;

app.listen(port, async () => {
    console.log(`Server started on port ${port}`);
    mongoose.connect(config.mongodb,
    {
            user: "amiralisarab42",
            pass: "eNfalFxxNzgmlKpB",
            authSource: "admin",
            retryWrites: true,
            w:"majority",
            appName: "Cluster0"
        }).then(() => {
        console.log("Connected to database successfully");
        bot.launch(() => console.log("Connected to Telegram successfully"));
    });
});
