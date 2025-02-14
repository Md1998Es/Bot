const fs = require("fs");
const ExcelJS = require("exceljs");
const { Telegraf, Scenes, session } = require("telegraf");
const { default: axios } = require("axios");
const config = require("./config.json");
const transactionModel = require("./Models/transactionModel");
const Paystar = require("./Gateways/zibal");
const bot = new Telegraf(config.botToken);
const TronWeb = require("tronweb");
const userModel = require("./Models/userModel");
const walletModel = require("./Models/walletModel");
const { privateKey, address } = TronWeb.fromMnemonic(config.wallet);
const tronWeb = new TronWeb({
    fullHost: "https://api.trongrid.io",
    headers: { "TRON-PRO-API-KEY": "beb5510a-87ca-465e-8808-afced07fcaaa" },
    privateKey: privateKey.slice(2),
});
const keyBoard = [
    ["💵 خرید ترون", "👤 ارتباط با پشتیبانی"],
    ["🔰 رهگیری سفارش", "💳 قیمت ترون"],
    ["📱 ماشین حساب", "💸 موجودی ربات"],
];
let sleep = fs.readFileSync("./sleep.txt", "utf8");
console.log(sleep);
sleep = sleep == "true";
let trx_price;
let rules;

try {
    getTrxPrice();
    getRules();
} catch (error) {
    console.log(error);
}

setInterval(() => {
    try {
        getRules();
        getTrxPrice();
    } catch (error) {
        console.log(error);
    }
}, 30 * 1000);

const buyTrxScene = new Scenes.WizardScene(
    "buyTrx",
    async (ctx) => {
        try {
            if (sleep && ctx.chat.id != config.admin) {
                ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(
                    () => {}
                );
                return ctx.scene.leave();
            }
            const user = await userModel.findOne({ uuid: ctx.chat.id });
            if (!user) return ctx.scene.leave();
            const isMem = await isMember(ctx);
            if (!isMem) {
                ctx.sendMessage(
                    "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: config.channel.text,
                                        url: `https://t.me/${config.channel.id}`,
                                    },
                                ],
                                [
                                    {
                                        text: "✅ عضو شدم.",
                                        callback_data: "joined",
                                    },
                                ],
                            ],
                        },
                    }
                ).catch((e) => {});
                return ctx.scene.leave();
            }
            if (user && user.isBanned) {
                ctx.sendMessage("شما توسط ادمین مسدود شده اید.").catch(
                    (e) => {}
                );
                return ctx.scene.leave();
            }
            ctx.wizard.state.walletBalance = tronWeb.fromSun(
                await tronWeb.trx.getUnconfirmedBalance(address)
            );
            if (ctx.wizard.state.walletBalance < 5) {
                ctx.sendMessage("ربات موجودی ندارد.").catch((e) => {});
                return ctx.scene.leave();
            }
            ctx.sendMessage(
                "💰 لطفا مقدار ترونی که میخواهید بخرید را بر حسب تومان وارد کنید",
                {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: [["بازگشت به منو 🔙"]],
                    },
                }
            ).catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                ctx.wizard.state.walletBalance = tronWeb.fromSun(
                    await tronWeb.trx.getUnconfirmedBalance(address)
                );
                const number = Number.parseInt(ctx.message.text);
                const tax = number > 300000 ? 20000 : 5000;
                ctx.wizard.state.tronPrice = trx_price;
                ctx.wizard.state.totalPrice = +(
                    number / ctx.wizard.state.tronPrice
                );
                if (!number) {
                    ctx.sendMessage(
                        "⭕ عددی که وارد کرده اید معتبر نیست، لطفا عددی معتبر وارد کنید"
                    ).catch((e) => {});
                } else if (500000 < number || 5000 > number) {
                    ctx.sendMessage(
                        `⭕ مقداری که وارد کرده اید مطابق حد مجاز نیست (5 هزار تومان الی 500 هزار تومان)`
                    ).catch((e) => {});
                } else if (
                    ctx.wizard.state.totalPrice > ctx.wizard.state.walletBalance
                ) {
                    ctx.sendMessage(
                        "⭕ مقدار وارد شده از موجودی ربات بیشتر است، لطفا مقدار کمتری وارد کنید"
                    ).catch((e) => {});
                } else {
                    ctx.wizard.state.totalPrice = +(
                        number / ctx.wizard.state.tronPrice
                    ).toFixed(3);
                    ctx.wizard.state.amount = number + tax;
                    ctx.sendMessage("💳 لطفا آدرس ولت خود را وارد کنید.").catch(
                        (e) => {}
                    );
                    return ctx.wizard.next();
                }
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                if (!tronWeb.isAddress(ctx.message.text)) {
                    ctx.sendMessage(
                        "⭕ آدرس ترون وارد شده معتبر نیست، آدرس معتبری را وارد کنید"
                    ).catch((e) => {});
                } else {
                    ctx.wizard.state.walletAddress = ctx.message.text;
                    ctx.wizard.state.order_id = getRandomInt(
                        1000000000,
                        9999999999
                    );
                    ctx.sendMessage(
                        `✅ آیا اطلاعات زیر مورد تایید است؟

آدرس واریز\\: ${ctx.wizard.state.walletAddress}
مقدار بر حسب ترون\\: ${ctx.wizard.state.totalPrice}
مقدار بر حسب تومان\\: ${ctx.wizard.state.amount.toLocaleString()}
کد رهگیری\\: ${ctx.wizard.state.order_id}

برای تایید کلمه *تایید* و برای لغو دکمه *لغو* را کلیک کنید`.replace(".", "\\."),
                        {
                            parse_mode: "MarkdownV2",
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "⭕ لغو",
                                            callback_data: "deny",
                                        },
                                        {
                                            text: "✅ تایید",
                                            callback_data: "accept",
                                        },
                                    ],
                                ],
                            },
                        }
                    ).catch((e) => {});
                    return ctx.wizard.next();
                }
                // if (
                //     !(await walletModel.findOne({ address: ctx.message.text }))
                // ) {
                //     ctx.sendMessage(
                //         "⭕ آدرس وارد شده احراز نشده است. لطفا برای احراز کردن آدرس خود از طریق منوی ربات با پشتیبانی تماس بگیرید. ",
                //         {
                //             reply_markup: {
                //                 resize_keyboard: true,
                //                 keyboard: keyBoard,
                //             },
                //         }
                //     ).catch((e) => {});
                //     return ctx.scene.leave();
                // }
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            if (ctx.callbackQuery) {
                ctx.answerCbQuery().catch((e) => {});
            }
            if (ctx.callbackQuery && ctx.callbackQuery.data == "accept") {
                const [amount, order_id, trx_amount] = [
                    Number.parseInt(ctx.wizard.state.amount) * 10,
                    ctx.wizard.state.order_id,
                    ctx.wizard.state.totalPrice,
                ];
                const user = await userModel.findOne({ uuid: ctx.chat.id });
                const gateway = await new Paystar().create(
                    amount,
                    order_id,
                    ctx.chat.id,
                    user.card_number
                );
                await new transactionModel({
                    uuid: ctx.chat.id,
                    order_id,
                    ref_num: gateway.data.ref_num,
                    amount,
                    payment_amount: gateway.data.payment_amount,
                    trx_amount,
                    wallet: ctx.wizard.state.walletAddress,
                    Date: Date.now(),
                })
                    .save()
                    .then(async () => {
                        const user = await userModel.findOne({
                            uuid: ctx.chat.id,
                        });
                        user.transactions.push(order_id);
                        await user.save();
                        ctx.sendMessage(
                            `✅ تراکنش با مبلغ نهایی ${(
                                gateway.data.payment_amount / 10
                            ).toLocaleString()} تومان در انتظار پرداخت است.`,
                            {
                                reply_markup: {
                                    resize_keyboard: true,
                                    keyboard: keyBoard,
                                },
                            }
                        )
                            .then(() => {
                                ctx.sendMessage(
                                    "🔗 شما میتوانید با دکمه زیر اقدام به پرداخت کنید. حتما برای پرداخت فیلتر شکن خود ا خاموش کنید.",
                                    {
                                        reply_markup: {
                                            inline_keyboard: [
                                                [
                                                    {
                                                        text: "💳 پرداخت نهایی",
                                                        url: gateway.url,
                                                    },
                                                ],
                                            ],
                                        },
                                    }
                                ).catch((e) => {});
                            })
                            .catch((e) => {});
                    });
            } else if (
                (ctx.message && ctx.message.text == "بازگشت به منو 🔙") ||
                (ctx.callbackQuery && ctx.callbackQuery.data == "deny")
            ) {
                ctx.sendMessage("⭕ لغو شد.", {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: keyBoard,
                    },
                }).catch((e) => {});
            }
            return ctx.scene.leave();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const SupportScene = new Scenes.WizardScene(
    "Support",
    async (ctx) => {
        try {
            if (sleep && ctx.chat.id != config.admin) {
                ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(
                    () => {}
                );
                return ctx.scene.leave();
            }
            const user = await userModel.findOne({ uuid: ctx.chat.id });
            if (!user) return ctx.scene.leave();
            const isMem = await isMember(ctx);
            if (!isMem) {
                ctx.sendMessage(
                    "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: config.channel.text,
                                        url: `https://t.me/${config.channel.id}`,
                                    },
                                ],
                                [
                                    {
                                        text: "✅ عضو شدم.",
                                        callback_data: "joined",
                                    },
                                ],
                            ],
                        },
                    }
                ).catch((e) => {});
                return ctx.scene.leave();
            }
            try {
                ctx.answerCbQuery().catch((e) => {});
            } catch (e) {}
            if ((await userModel.findOne({ uuid: ctx.chat.id })).isBanned) {
                ctx.sendMessage("شما توسط ادمین مسدود شده اید.").catch(
                    (e) => {}
                );
                return ctx.scene.leave();
            }
            if (ctx.match[1]) ctx.wizard.state.uuid = ctx.match[1];
            else ctx.wizard.state.uuid = config.admin;
            ctx.sendMessage(
                "✅ لطفا پیام/عکس/فایل/ویدئو خود را خود را ارسال کنید.",
                {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: [["بازگشت به منو 🔙"]],
                    },
                }
            );
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        try {
            return back(ctx).then((result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                ctx.telegram
                    .sendMessage(
                        ctx.wizard.state.uuid,
                        `ℹ️ پیامی از طرف کاربر با آیدی عددی ${ctx.chat.id}`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "ارسال پاسخ",
                                            callback_data: `answer ${ctx.chat.id}`,
                                        },
                                    ],
                                ],
                            },
                        }
                    )
                    .then(() => {
                        ctx.forwardMessage(ctx.wizard.state.uuid).catch(
                            (e) => {}
                        );
                    })
                    .catch((e) => {});
                ctx.sendMessage("✅ با موفقیت ارسال شد.", {
                    reply_markup: { resize_keyboard: true, keyboard: keyBoard },
                }).catch((e) => {});
                return ctx.scene.leave();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const TrackingScene = new Scenes.WizardScene(
    "Tracking",
    async (ctx) => {
        try {
            if (sleep && ctx.chat.id != config.admin) {
                ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(
                    () => {}
                );
                return ctx.scene.leave();
            }
            const isMem = await isMember(ctx);
            if (!isMem && ctx.chat.id != config.admin) {
                ctx.sendMessage(
                    "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: config.channel.text,
                                        url: `https://t.me/${config.channel.id}`,
                                    },
                                ],
                                [
                                    {
                                        text: "✅ عضو شدم.",
                                        callback_data: "joined",
                                    },
                                ],
                            ],
                        },
                    }
                ).catch((e) => {});
                return ctx.scene.leave();
            }
            const user = await userModel.findOne({ uuid: ctx.chat.id });
            if (!user) return ctx.scene.leave();
            if (user && user.isBanned) {
                ctx.sendMessage("شما توسط ادمین مسدود شده اید.").catch(
                    (e) => {}
                );
                return ctx.scene.leave();
            }
            ctx.sendMessage("✅️ لطفا کد سفارش را وارد کنید.", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                const transaction = await transactionModel.findOne({
                    order_id: ctx.message.text,
                });
                if (!transaction) {
                    ctx.sendMessage(
                        "⚠️ تراکنش مورد نظر در سیستم وجود ندارد، لطفا کد درستی را وارد کنید."
                    ).catch((e) => {});
                    return ctx.wizard.selectStep(1);
                }
                ctx.sendMessage(
                    `🔰 شماره سفارش: ${transaction.order_id}
👤 کاربر: ${transaction.uuid}
🔹️ مبلغ بر حسب تومان: ${(transaction.amount / 10).toLocaleString()}
💠 مبلغ بر حسب ترون: ${transaction.trx_amount}
💳 آدرس ولت: ${transaction.wallet}
🕜 زمان: ${transaction.Date.toLocaleString()}
🌐 وضعیت: ${
                        transaction.status
                            ? "واریز ترون موفق بود."
                            : "عدم پرداخت پول توسط کاربر"
                    }
${transaction.status ? `🔥 لینک تراکنش: ${transaction.url}` : ""}`,
                    {
                        reply_markup: {
                            resize_keyboard: true,
                            keyboard: keyBoard,
                        },
                    }
                ).catch((e) => {});
                return ctx.scene.leave();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const UserInfoScene = new Scenes.WizardScene(
    "UserInfo",
    async (ctx) => {
        try {
            if (ctx.chat.id != config.admin) {
                return ctx.scene.leave();
            }
            ctx.sendMessage("👤 آیدی عددی کاربر را وارد کنید.", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                const uuid = Number.parseInt(ctx.message.text);
                if (!uuid) {
                    ctx.sendMessage("⭕ آیدی عددی نامعتبر.").catch((e) => {});
                }
                const user = await userModel.findOne({ uuid });
                if (!user) {
                    ctx.sendMessage(
                        `⭕ کاربر با آیدی عددی ${uuid} پیدا نشد.`
                    ).catch((e) => {});
                    return ctx.scene.leave();
                }
                Promise.all(
                    user.transactions.map(async (order_id) => {
                        const transaction = await transactionModel.findOne({
                            order_id,
                        });
                        if (transaction.status) {
                            return transaction.order_id;
                        }
                        return false;
                    })
                ).then((result) => {
                    const transactions = result.filter(
                        (transaction) => transaction != false
                    );
                    ctx.sendMessage(
                        `👤 آیدی عددی: ${user.uuid}
🔗 تعداد تراکنش: ${transactions.length}${
                            !!transactions.length
                                ? `\n💸 تراکنش ها: 
${transactions.join(", \n")}`
                                : ""
                        }
💳 شماره کارت: ${user.card_number}
ℹ️ شماره تلفن: ${user.phone_number}
📱 وضعیت کاربر: ${user.isBanned ? "مسدود" : "آزاد"}`
                    ).catch((e) => {});
                    return ctx.scene.leave();
                });
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const BlockScene = new Scenes.WizardScene(
    "Block",
    async (ctx) => {
        try {
            if (ctx.chat.id != config.admin) {
                return ctx.scene.leave();
            }
            ctx.sendMessage("👤 آیدی عددی کاربر را وارد کنید.", {
                reply_markup: {
                    keyBoard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                const uuid = Number.parseInt(ctx.message.text);
                if (!uuid) {
                    ctx.sendMessage("⭕ آیدی عددی نامعتبر.").catch((e) => {});
                }
                const user = await userModel.findOne({ uuid });
                if (!user) {
                    ctx.sendMessage(
                        `⭕ کاربر با آیدی عددی ${uuid} پیدا نشد.`
                    ).catch((e) => {});
                    return ctx.scene.leave();
                }
                user.isBanned = true;
                await user.save();
                ctx.sendMessage("⭕ با موفقیت مسدود شد.").catch((e) => {});
                return ctx.scene.leave();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const UnBlockScene = new Scenes.WizardScene(
    "UnBlock",
    async (ctx) => {
        try {
            if (ctx.chat.id != config.admin) {
                return ctx.scene.leave();
            }
            ctx.sendMessage("👤 آیدی عددی کاربر را وارد کنید.", {
                reply_markup: {
                    keyBoard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                const uuid = Number.parseInt(ctx.message.text);
                if (!uuid) {
                    ctx.sendMessage("⭕ آیدی عددی نامعتبر.").catch((e) => {});
                }
                const user = await userModel.findOne({ uuid });
                if (!user) {
                    ctx.sendMessage(
                        `⭕ کاربر با آیدی عددی ${uuid} پیدا نشد.`
                    ).catch((e) => {});
                    return ctx.scene.leave();
                }
                user.isBanned = false;
                await user.save();
                ctx.sendMessage("✅ با موفقیت آزاد شد.").catch((e) => {});
                return ctx.scene.leave();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const StartScene = new Scenes.WizardScene(
    "Start",
    async (ctx) => {
        try {
            if (sleep && ctx.chat.id != config.admin) {
                ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(
                    () => {}
                );
                return ctx.scene.leave();
            }
            const user = await userModel.findOne({ uuid: ctx.chat.id });
            if (user && !user.status) {
                ctx.sendMessage(
                    "⭕ ادمین هنوز درخواست احراز هویت قبلی شما را تایید نکرده است."
                ).catch((e) => {});
                return ctx.scene.leave();
            }
            if (user && user.isBanned) {
                ctx.sendMessage("شما توسط ادمین مسدود شده اید.").catch(
                    (e) => {}
                );
                return ctx.scene.leave();
            }
            if (user && user.status) {
                ctx.sendMessage("✅ خوش آمدید.", {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: keyBoard,
                    },
                }).catch((e) => {});
                return ctx.scene.leave();
            }
            const isMem = await isMember(ctx);
            if (isMem) {
                ctx.sendMessage(rules.text, {
                    entities: rules.entities,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✅ تایید", callback_data: "accept" }],
                        ],
                    },
                }).catch((e) => {});
                return ctx.wizard.next();
            } else {
                ctx.sendMessage(
                    "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: config.channel.text,
                                        url: `https://t.me/${config.channel.id}`,
                                    },
                                ],
                                [
                                    {
                                        text: "✅ عضو شدم.",
                                        callback_data: "joined",
                                    },
                                ],
                            ],
                        },
                    }
                ).catch((e) => {});
            }
            return ctx.scene.leave();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            try {
                ctx.answerCbQuery().catch((e) => {});
            } catch (err) {}
            if (ctx.callbackQuery && ctx.callbackQuery.data == "accept") {
                ctx.sendMessage(
                    "📱 لطفا با استفاده از دکمه زیر شماره خود را برای ما ارسال کنید.",
                    {
                        reply_markup: {
                            resize_keyboard: true,
                            keyboard: [
                                [
                                    {
                                        text: "ارسال شماره",
                                        request_contact: true,
                                    },
                                ],
                            ],
                        },
                    }
                ).catch((e) => {});
                return ctx.wizard.next();
            }
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد").catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            const isIranian =
                ctx.message.contact.phone_number.startsWith("+98") ||
                ctx.message.contact.phone_number.startsWith("98") ||
                ctx.message.contact.phone_number.startsWith("09");
            if (!ctx.message.contact || !isIranian) {
                ctx.sendMessage("⭕ شماره شما مربوط به ایران نیست.").catch(
                    (e) => {}
                );
                return ctx.scene.leave();
            }
            ctx.wizard.state.phone_number = ctx.message.contact.phone_number;
            ctx.sendMessage(
                `✅ خوش آمدید. لطفا به پرسش های زیر پاسخ مناسب بدهید.

⭕ نکته: اطلاعات وارد شده قابل تغییر نیستند، لطفا با دقت وارد کنید.`
            )
                .then(() =>
                    ctx
                        .sendMessage(
                            `💳 لطفا شماره کارت 16 رقمی خود را بدون فاصله و کاملا چسبیده وارد کنید.

⭕ نکته: دقت کنید که شماره تلفن و شماره کارت وارد شده به نام یک شخص باشند در غیر این صورت خرید شما انجام نخواهد شد.`,
                            {
                                reply_markup: { remove_keyboard: true },
                            }
                        )
                        .catch((e) => {})
                )
                .catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد").catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            if (ctx.message.text.length != 16) {
                ctx.sendMessage(
                    "⭕ شماره کارت وارد شده معتبر نیست، شماره کارت معتبری را وارد کنید"
                ).catch((e) => {});
            } else {
                ctx.wizard.state.card_number = ctx.message.text;
                await new userModel({
                    uuid: ctx.chat.id,
                    card_number: Number.parseInt(ctx.wizard.state.card_number),
                    phone_number: ctx.wizard.state.phone_number,
                    status: true,
                }).save();
                ctx.sendMessage("✅ تایید شد.", {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: keyBoard,
                    },
                }).catch((e) => {});
                // ctx.sendMessage("✅ لطفا منتظر تایید ادمین بمانید.");
                //             ctx.telegram
                //                 .sendMessage(
                //                     config.admin,
                //                     `کاربر جدیدی درخواست احراز هویت دارد

                // 👤 آیدی عددی: ${ctx.chat.id}
                // ℹ️ آیدی: ${ctx.chat.username}
                // 💳 شماره کارت: ${ctx.message.text}
                // 📱 شماره تلفن: ${ctx.wizard.state.phone_number}`,
                //                     {
                //                         reply_markup: {
                //                             inline_keyboard: [
                //                                 [
                //                                     {
                //                                         text: "⭕ رد",
                //                                         callback_data: `verify false ${ctx.chat.id}`,
                //                                     },
                //                                     {
                //                                         text: "✅ تایید",
                //                                         callback_data: `verify true ${ctx.chat.id}`,
                //                                     },
                //                                 ],
                //                             ],
                //                         },
                //                     }
                //                 )
                //                 .catch((e) => {});
                return ctx.scene.leave();
            }
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
// const AddWalletScene = new Scenes.WizardScene(
//     "AddWallet",
//     (ctx) => {
//         try {
//             if (ctx.chat.id != config.admin) return ctx.scene.leave;
//             ctx.sendMessage("💳 آدرسی که میخواهید اضافه کنید را ارسال کنید.", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: [["بازگشت به منو 🔙"]],
//                 },
//             }).catch((e) => {});
//             return ctx.wizard.next();
//         } catch (error) {
//             console.log(error);
//             ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: keyBoard,
//                 },
//             }).catch((e) => {});
//             return ctx.scene.leave();
//         }
//     },
//     async (ctx) => {
//         try {
//             return back(ctx).then(async (result) => {
//                 if (result) {
//                     return ctx.scene.leave();
//                 }
//                 if (!tronWeb.isAddress(ctx.message.text)) {
//                     ctx.sendMessage(
//                         "⭕ آدرس ترون وارد شده معتبر نیست، آدرس معتبری را وارد کنید"
//                     );
//                 }
//                 if (await walletModel.findOne({ address: ctx.message.text })) {
//                     ctx.sendMessage("⭕ آدرس مورد نظر قبلا ثبت شده است.");
//                     return ctx.scene.leave();
//                 }
//                 await new walletModel({ address: ctx.message.text }).save();
//                 ctx.sendMessage(
//                     `✅ آدرس ${ctx.message.text} با موفقیت اضافه شد.`,
//                     {
//                         reply_markup: {
//                             resize_keyboard: true,
//                             keyboard: keyBoard,
//                         },
//                     }
//                 ).catch((e) => {});
//                 return ctx.scene.leave();
//             });
//         } catch (error) {
//             console.log(error);
//             ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: keyBoard,
//                 },
//             }).catch((e) => {});
//             return ctx.scene.leave();
//         }
//     }
// );
// const RemoveWalletScene = new Scenes.WizardScene(
//     "RemoveWallet",
//     (ctx) => {
//         try {
//             if (ctx.chat.id != config.admin) return ctx.scene.leave;
//             ctx.sendMessage("💳 آدرسی که میخواهید حذف کنید را ارسال کنید.", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: [["بازگشت به منو 🔙"]],
//                 },
//             }).catch((e) => {});
//             return ctx.wizard.next();
//         } catch (error) {
//             console.log(error);
//             ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: keyBoard,
//                 },
//             }).catch((e) => {});
//             return ctx.scene.leave();
//         }
//     },
//     async (ctx) => {
//         try {
//             return back(ctx).then(async (result) => {
//                 if (result) {
//                     return ctx.scene.leave();
//                 }
//                 if (!tronWeb.isAddress(ctx.message.text)) {
//                     ctx.sendMessage(
//                         "⭕ آدرس ترون وارد شده معتبر نیست، آدرس معتبری را وارد کنید"
//                     ).catch((e) => {});
//                 }
//                 if (
//                     !(await walletModel.findOne({ address: ctx.message.text }))
//                 ) {
//                     ctx.sendMessage("⭕ آدرس مورد نظر ثبت نشده است.").catch(
//                         (e) => {}
//                     );
//                     return ctx.scene.leave();
//                 }
//                 await walletModel.deleteOne({ address: ctx.message.text });
//                 ctx.sendMessage(
//                     `⭕ آدرس ${ctx.message.text} با موفقیت حذف شد.`,
//                     {
//                         reply_markup: {
//                             resize_keyboard: true,
//                             keyboard: keyBoard,
//                         },
//                     }
//                 ).catch((e) => {});
//                 return ctx.scene.leave();
//             });
//         } catch (error) {
//             console.log(error);
//             ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//                 reply_markup: {
//                     resize_keyboard: true,
//                     keyboard: keyBoard,
//                 },
//             }).catch((e) => {});
//             return ctx.scene.leave();
//         }
//     }
// );
const SetRulesScene = new Scenes.WizardScene(
    "SetRules",
    (ctx) => {
        try {
            if (config.admin !== ctx.chat.id) return ctx.scene.leave();
            ctx.sendMessage("📃 لطفا قوانین جدید ارسال کنید.").catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        try {
            fs.writeFile(
                "./rules.json",
                JSON.stringify({
                    text: ctx.message.text,
                    entities: ctx.message.entities,
                }),
                "utf8",
                (error) => {
                    if (error) {
                        console.log(error);
                        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                            reply_markup: {
                                resize_keyboard: true,
                                keyboard: keyBoard,
                            },
                        }).catch((e) => {});
                    } else {
                        ctx.sendMessage("✅ قوانین با موفقیت تغییر کرد.").catch(
                            (e) => {}
                        );
                    }
                    return ctx.scene.leave();
                }
            );
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const MessageScene = new Scenes.WizardScene(
    "Message",
    (ctx) => {
        try {
            if (ctx.chat.id != config.admin) return ctx.scene.leave();
            ctx.sendMessage("✔ لطفا آیدی عددی کاربر را وارد کنید.", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                ctx.wizard.state.user = await userModel.findOne({
                    uuid: ctx.message.text,
                });
                if (!ctx.wizard.state.user) {
                    ctx.sendMessage(
                        "⭕ کاربر با این آیدی عددی پیدا نشد."
                    ).catch((e) => {});
                    return ctx.scene.leave();
                }
                ctx.sendMessage("📁 پیامی که میخواهید ارسال کنید را بفرستید.", {
                    reply_markup: {
                        resize_keyboard: true,
                        keyboard: [["بازگشت به منو 🔙"]],
                    },
                }).catch((e) => {});
                return ctx.wizard.next();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                ctx.telegram.sendMessage(
                    ctx.wizard.state.user.uuid,
                    `📁 پیامی از طرف ادمین:

${ctx.message.text}`
                );
                ctx.sendMessage("✅ ارسال شد.").catch((e) => {});
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const RemoveUserScene = new Scenes.WizardScene(
    "RemoveUser",
    (ctx) => {
        try {
            if (ctx.chat.id != config.admin) return ctx.scene.leave();
            ctx.sendMessage("📁 آیدی عددی کاربر را وارد کنید.", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: [["بازگشت به منو 🔙"]],
                },
            }).catch((e) => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                const user = await userModel.findOne({
                    uuid: ctx.message.text,
                });
                if (!user) {
                    ctx.sendMessage("⭕ کاربر پیدا نشد.").catch((e) => {});
                    return ctx.scene.leave();
                }
                userModel
                    .deleteOne({ uuid: Number.parseInt(ctx.message.text) })
                    .then(() => {
                        ctx.sendMessage("✅ کاربر با موفقیت حذف شد.");
                        ctx.telegram.sendMessage(
                            ctx.message.text,
                            "⭕ احراز هویت شما توسط ادمین حذف شد."
                        );
                    });
                return ctx.scene.leave();
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const calculatorScene = new Scenes.WizardScene(
    "Calculator",
    (ctx) => {
        try {
            if (sleep && ctx.chat.id != config.admin) {
                ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(
                    () => {}
                );
                return;
            }
            ctx.sendMessage(
                "💸 لطفا مقدار ترونی که میخواهید به تومان تبدیل کنید را ارسال کنید.",
                {
                    reply_markup: {
                        keyboard: [["بازگشت به منو 🔙"]],
                        resize_keyboard: true,
                    },
                }
            ).catch(() => {});
            return ctx.wizard.next();
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    },
    (ctx) => {
        try {
            return back(ctx).then(async (result) => {
                if (result) {
                    return ctx.scene.leave();
                }
                if (!isNaN(ctx.message.text)) {
                    ctx.sendMessage(
                        `💳 قیمت ${
                            ctx.message.text
                        } ترون معادل ${Number.parseInt(
                            Number.parseFloat(ctx.message.text) * trx_price
                        ).toLocaleString()} تومان است.`,
                        {
                            reply_markup: {
                                keyboard: keyBoard,
                                resize_keyboard: true,
                            },
                        }
                    ).catch(() => {});
                    return ctx.scene.leave();
                }

                ctx.sendMessage(
                    "⭕ مقداری که وارد کرده اید معتبر نیست. لطفا مقدار معتبری وارد کنید."
                ).catch(() => {});
            });
        } catch (error) {
            console.log(error);
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return ctx.scene.leave();
        }
    }
);
const stage = new Scenes.Stage([
    buyTrxScene,
    SetRulesScene,
    SupportScene,
    TrackingScene,
    UserInfoScene,
    BlockScene,
    UnBlockScene,
    StartScene,
    // AddWalletScene,
    // RemoveWalletScene,
    MessageScene,
    RemoveUserScene,
    calculatorScene,
]);
bot.use(session());
bot.use(stage.middleware());

bot.start(Scenes.Stage.enter("Start"));

bot.hears("💵 خرید ترون", Scenes.Stage.enter("buyTrx"));
bot.hears("👤 ارتباط با پشتیبانی", Scenes.Stage.enter("Support"));
bot.hears("🔰 رهگیری سفارش", Scenes.Stage.enter("Tracking"));
bot.hears("👤 دیدن اطلاعات کاربر", Scenes.Stage.enter("UserInfo"));
bot.hears("⭕ مسدود کردن کاربر", Scenes.Stage.enter("Block"));
bot.hears("✅ آزاد کردن کاربر", Scenes.Stage.enter("UnBlock"));
// bot.hears("💳 افزودن ولت", Scenes.Stage.enter("AddWallet"));
// bot.hears("⭕ حذف ولت", Scenes.Stage.enter("RemoveWallet"));
bot.hears("📃 تغییر قوانین", Scenes.Stage.enter("SetRules"));
bot.hears("📁 ارسال پیام", Scenes.Stage.enter("Message"));
bot.hears("⭕ حذف کاربر", Scenes.Stage.enter("RemoveUser"));
bot.hears("📱 ماشین حساب", Scenes.Stage.enter("Calculator"));
bot.hears("📃 تعداد کاربر ها", async (ctx) => {
    try {
        if (ctx.chat.id != config.admin) return;
        ctx.sendMessage(
            `👤 تعداد کاربران ربات تا این لحظه: ${(
                await userModel.find({})
            ).length.toLocaleString()}`
        ).catch((error) => {});
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});
bot.hears("💸 موجودی ربات", async (ctx) => {
    try {
        if (sleep && ctx.chat.id != config.admin) {
            ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(() => {});
            return;
        }
        const balance = tronWeb.fromSun(
            await tronWeb.trx.getUnconfirmedBalance(address)
        );
        ctx.sendMessage(
            `💸 موجودی ربات در حال حاضر:
    
    - ترون: ${balance.toLocaleString()}
    - تومان: ${Number.parseInt(balance * trx_price).toLocaleString()}`
        ).catch((error) => {
            ctx.sendMessage("⭕ عملیات با خطا مواجه شد").catch((e) => {});
        });
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});
bot.hears("📁 دریافت اکسل", async (ctx) => {
    try {
        if (ctx.chat.id != config.admin) return;
        const all_transactions = await transactionModel.find({});
        const true_transactions = await transactionModel.find({ status: true });
        const all_users = await userModel.find({});
        const true_users = await userModel.find({ status: true });
        // const all_wallets = await walletModel.find({});

        const all_transactions_workbook = new ExcelJS.Workbook();
        const true_transactions_workbook = new ExcelJS.Workbook();
        const all_users_workbook = new ExcelJS.Workbook();
        const true_users_workbook = new ExcelJS.Workbook();
        // const all_wallets_workbook = new ExcelJS.Workbook();

        all_transactions.creator = "ElMando";
        all_transactions.lastModifiedBy = "ElMando";
        true_transactions.creator = "ElMando";
        true_transactions.lastModifiedBy = "ElMando";
        all_users.creator = "ElMando";
        all_users.lastModifiedBy = "ElMando";
        true_users.creator = "ElMando";
        true_users.lastModifiedBy = "ElMando";
        // all_wallets.creator = "ElMando";
        // all_wallets.lastModifiedBy = "ElMando";

        const all_transactions_sheet =
            all_transactions_workbook.addWorksheet("allTransactions");
        const true_transactions_sheet =
            true_transactions_workbook.addWorksheet("trueTransactions");
        const all_users_sheet = all_users_workbook.addWorksheet("allUsers");
        const true_users_sheet = true_users_workbook.addWorksheet("trueUsers");
        // const all_wallets_sheet =
        //     all_wallets_workbook.addWorksheet("allWallets");

        all_transactions_sheet.getRow(1).getCell(1).value = "order_id";
        all_transactions_sheet.getRow(1).getCell(2).value = "uuid";
        all_transactions_sheet.getRow(1).getCell(3).value = "ref_num";
        all_transactions_sheet.getRow(1).getCell(4).value = "amount";
        all_transactions_sheet.getRow(1).getCell(5).value = "payment_amount";
        all_transactions_sheet.getRow(1).getCell(6).value = "trx_amount";
        all_transactions_sheet.getRow(1).getCell(7).value = "wallet";
        all_transactions_sheet.getRow(1).getCell(8).value = "url";
        all_transactions_sheet.getRow(1).getCell(8).value = "Date";
        all_transactions.forEach((item, index) => {
            all_transactions_sheet.getRow(index + 2).getCell(1).value =
                item.order_id;
            all_transactions_sheet.getRow(index + 2).getCell(2).value =
                item.uuid;
            all_transactions_sheet.getRow(index + 2).getCell(3).value =
                item.ref_num;
            all_transactions_sheet.getRow(index + 2).getCell(4).value =
                item.amount;
            all_transactions_sheet.getRow(index + 2).getCell(5).value =
                item.payment_amount;
            all_transactions_sheet.getRow(index + 2).getCell(6).value =
                item.trx_amount;
            all_transactions_sheet.getRow(index + 2).getCell(7).value =
                item.wallet;
            all_transactions_sheet.getRow(index + 2).getCell(8).value =
                item.url;
            all_transactions_sheet.getRow(index + 2).getCell(8).value =
                item.Date;
        });

        true_transactions_sheet.getRow(1).getCell(1).value = "order_id";
        true_transactions_sheet.getRow(1).getCell(2).value = "uuid";
        true_transactions_sheet.getRow(1).getCell(3).value = "ref_num";
        true_transactions_sheet.getRow(1).getCell(4).value = "amount";
        true_transactions_sheet.getRow(1).getCell(5).value = "payment_amount";
        true_transactions_sheet.getRow(1).getCell(6).value = "trx_amount";
        true_transactions_sheet.getRow(1).getCell(7).value = "wallet";
        true_transactions_sheet.getRow(1).getCell(8).value = "url";
        true_transactions_sheet.getRow(1).getCell(8).value = "Date";
        true_transactions.forEach((item, index) => {
            true_transactions_sheet.getRow(index + 2).getCell(1).value =
                item.order_id;
            true_transactions_sheet.getRow(index + 2).getCell(2).value =
                item.uuid;
            true_transactions_sheet.getRow(index + 2).getCell(3).value =
                item.ref_num;
            true_transactions_sheet.getRow(index + 2).getCell(4).value =
                item.amount;
            true_transactions_sheet.getRow(index + 2).getCell(5).value =
                item.payment_amount;
            true_transactions_sheet.getRow(index + 2).getCell(6).value =
                item.trx_amount;
            true_transactions_sheet.getRow(index + 2).getCell(7).value =
                item.wallet;
            true_transactions_sheet.getRow(index + 2).getCell(8).value =
                item.url;
            true_transactions_sheet.getRow(index + 2).getCell(8).value =
                item.Date;
        });

        all_users_sheet.getRow(1).getCell(1).value = "uuid";
        all_users_sheet.getRow(1).getCell(2).value = "transactions";
        all_users_sheet.getRow(1).getCell(3).value = "isBanned";
        all_users_sheet.getRow(1).getCell(4).value = "card_number";
        all_users_sheet.getRow(1).getCell(5).value = "phone_number";
        all_users.forEach((item, index) => {
            all_users_sheet.getRow(index + 2).getCell(1).value = item.uuid;
            all_users_sheet.getRow(index + 2).getCell(2).value =
                item.transactions;
            all_users_sheet.getRow(index + 2).getCell(3).value = item.isBanned;
            all_users_sheet.getRow(index + 2).getCell(4).value =
                item.card_number;
            all_users_sheet.getRow(index + 2).getCell(5).value =
                item.phone_number;
        });

        true_users_sheet.getRow(1).getCell(1).value = "uuid";
        true_users_sheet.getRow(1).getCell(2).value = "transactions";
        true_users_sheet.getRow(1).getCell(3).value = "isBanned";
        true_users_sheet.getRow(1).getCell(4).value = "card_number";
        true_users_sheet.getRow(1).getCell(5).value = "phone_number";
        true_users.forEach((item, index) => {
            true_users_sheet.getRow(index + 2).getCell(1).value = item.uuid;
            true_users_sheet.getRow(index + 2).getCell(2).value =
                item.transactions;
            true_users_sheet.getRow(index + 2).getCell(3).value = item.isBanned;
            true_users_sheet.getRow(index + 2).getCell(4).value =
                item.card_number;
            true_users_sheet.getRow(index + 2).getCell(5).value =
                item.phone_number;
        });

        // all_wallets_sheet.getRow(1).getCell(1).value = "address";
        // all_wallets.forEach((item, index) => {
        //     all_wallets_sheet.getRow(index + 2).getCell(1).value = item.address;
        // });

        const time = Date.now();
        all_transactions_workbook.xlsx
            .writeFile(`./excel/all_transactions-${time}.xlsx`)
            .then(async () => {
                await ctx.sendDocument(
                    { source: `./excel/all_transactions-${time}.xlsx` }
                    // "تمامی تراکنش ها"
                );
            });
        true_transactions_workbook.xlsx
            .writeFile(`./excel/true_transactions-${time}.xlsx`)
            .then(async () => {
                await ctx.sendDocument(
                    { source: `./excel/true_transactions-${time}.xlsx` }
                    // "تراکنش های موفق"
                );
            });
        all_users_workbook.xlsx
            .writeFile(`./excel/all_users-${time}.xlsx`)
            .then(async () => {
                await ctx.sendDocument(
                    { source: `./excel/all_users-${time}.xlsx` }
                    // "تمامی کاربر ها"
                );
            });

        true_users_workbook.xlsx
            .writeFile(`./excel/true_users-${time}.xlsx`)
            .then(async () => {
                await ctx.sendDocument(
                    { source: `./excel/true_users-${time}.xlsx` }
                    // "کاربر های احراز هویت شده"
                );
            });
        // all_wallets_workbook.xlsx
        //     .writeFile(`./excel/all_wallets-${time}.xlsx`)
        //     .then(() => {
        //         ctx.sendDocument(
        //             { source: `./excel/all_wallets-${time}.xlsx` }
        //             // "تمامی کاربر ها"
        //         );
        //     });
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});
// bot.hears("📃 لیست ولت ها", async (ctx) => {
//     try {
//         if (config.admin !== ctx.chat.id) return;
//         const wallets = (await walletModel.find({}))
//             .map((wallet) => wallet.address)
//             .join("\n\n");
//         ctx.sendMessage(`لیست تمامی ولت های ثبت شده
    
// ${wallets}`);
//     } catch (error) {
//         console.log(error);
//         ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//             reply_markup: {
//                 resize_keyboard: true,
//                 keyboard: keyBoard,
//             },
//         }).catch((e) => {});
//     }
// });
bot.hears("💳 قیمت ترون", async (ctx) => {
    try {
        if (sleep && ctx.chat.id != config.admin) {
            ctx.sendMessage("⭕ در حال حاضر ربات غیرفعال است.").catch(() => {});
            return;
        }
        const user = await userModel.findOne({ uuid: ctx.chat.id });
        if (!user) return ctx.scene.leave();
        const isMem = await isMember(ctx);
        if (!isMem) {
            ctx.sendMessage(
                "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: config.channel.text,
                                    url: `https://t.me/${config.channel.id}`,
                                },
                            ],
                            [{ text: "✅ عضو شدم.", callback_data: "joined" }],
                        ],
                    },
                }
            ).catch((e) => {});
            return ctx.scene.leave();
        }
        if ((await userModel.findOne({ uuid: ctx.chat.id })).isBanned) {
            return ctx
                .sendMessage("شما توسط ادمین مسدود شده اید.")
                .catch((e) => {});
        }
        ctx.sendMessage(
            `💸 قیمت هر یک عدد ترون معادل ${Number.parseInt(
                trx_price
            ).toLocaleString()} تومان است.`
        ).catch((e) => {});
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});
bot.hears("📱 خاموش/روشن کردن ربات", (ctx) => {
    try {
        if (config.admin !== ctx.chat.id) return;
        if (sleep) {
            fs.writeFileSync("./sleep.txt", "false");
            sleep = false;
            ctx.sendMessage("✅ ربات روشن شد.").catch((e) => {});
        } else {
            fs.writeFileSync("./sleep.txt", "true");
            sleep = true;
            ctx.sendMessage("⭕ ربات خاموش شد.").catch((e) => {});
        }
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});
bot.hears("پنل", (ctx) => {
    try {
        if (ctx.chat.id != config.admin) return;
        ctx.sendMessage("⌨️ به پنل مدیریت خوش آمدید.", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: [
                    ["🔰 رهگیری سفارش", "👤 دیدن اطلاعات کاربر"],
                    ["⭕ مسدود کردن کاربر", "✅ آزاد کردن کاربر"],
                    // ["💳 افزودن ولت", "⭕ حذف ولت", "📃 لیست ولت ها"],
                    ["⭕ حذف کاربر", "📁 ارسال پیام", "📃 تغییر قوانین"],
                    ["📱 خاموش/روشن کردن ربات", "📁 دریافت اکسل"],
                    ["💸 موجودی ربات", "📃 تعداد کاربر ها"],
                ],
            },
        }).catch((e) => {});
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});

bot.action(/answer (.+)/, Scenes.Stage.enter("Support"));
// bot.action(/verify (.+) (.+)/, async (ctx) => {
//     try {
//         ctx.answerCbQuery().catch((e) => {});
//         if (ctx.match[1] == "true") {
//             const user = await userModel.findOne({ uuid: ctx.match[2] });
//             user.status = true;
//             await user.save();
//             ctx.sendMessage("✅ تایید شد.").catch((e) => {});
//             return ctx.telegram
//                 .sendMessage(ctx.match[2], "✅ ثبت نام موفق بود. خوش آمدید.", {
//                     reply_markup: {
//                         resize_keyboard: true,
//                         keyboard: keyBoard,
//                     },
//                 })
//                 .catch((e) => {});
//         }
//         await userModel.deleteOne({ uuid: ctx.match[2] });
//         ctx.sendMessage("⭕ رد شد.").catch((e) => {});
//         ctx.telegram.sendMessage(
//             ctx.match[2],
//             "⭕ احراز هویت شما توسط ادمین رد شد. دوباره تلاش کنید."
//         );
//     } catch (error) {
//         console.log(error);
//         ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
//             reply_markup: {
//                 resize_keyboard: true,
//                 keyboard: keyBoard,
//             },
//         }).catch((e) => {});
//     }
// });
bot.action("joined", async (ctx) => {
    try {
        ctx.answerCbQuery().catch((e) => {});
        const isMem = await isMember(ctx);
        if (isMem) {
            ctx.sendMessage("✅ عضویت شما تایید شد.").catch((e) => {});
        } else {
            ctx.sendMessage(
                "⭕ لطفا در کانال ما عضو شوید و سپس دوباره تلاش کنید.",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: config.channel.text,
                                    url: `https://t.me/${config.channel.id}`,
                                },
                            ],
                            [{ text: "✅ عضو شدم.", callback_data: "joined" }],
                        ],
                    },
                }
            );
        }
    } catch (error) {
        console.log(error);
        ctx.sendMessage("⭕ عملیات با خطا مواجه شد", {
            reply_markup: {
                resize_keyboard: true,
                keyboard: keyBoard,
            },
        }).catch((e) => {});
    }
});

bot.use(back);
module.exports = bot;

function getRandomInt(pmin, pmax) {
    try {
        const min = Math.ceil(pmin);
        const max = Math.floor(pmax);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    } catch (error) {
        console.log(error);
    }
}

async function isMember(ctx) {
    return true;
    // try {
    //     const status = (
    //         await ctx.telegram.getChatMember(config.channel.uuid, ctx.chat.id)
    //     ).status;
    //     return (
    //         (status == "administrator" ||
    //             status == "creator" ||
    //             status == "member") &&
    //         status != "kicked" &&
    //         status != "left"
    //     );
    // } catch (error) {
    //     return false;
    // }
}

function getRules() {
    fs.readFile("./rules.json", (error, data) => {
        if (error) {
            console.log(error);
        } else rules = JSON.parse(data);
    });
}

async function getTrxPrice() {
    const price =
        (
            await axios
                .post("https://api.nobitex.ir/market/stats", {
                    srcCurrency: "trx",
                    dstCurrency: "irr",
                })
                .catch((error) => console.log(error))
        ).data.stats["trx-irr"].bestSell / 10;
    trx_price = price;
}

async function back(ctx) {
    try {
        if (
            ctx.message.text == "بازگشت به منو 🔙" ||
            ctx.message.text == "لغو"
        ) {
            ctx.sendMessage("به منو برگشتید.", {
                reply_markup: {
                    resize_keyboard: true,
                    keyboard: keyBoard,
                },
            }).catch((e) => {});
            return true;
        } else return false;
    } catch (error) {
        console.log(error);
    }
}
