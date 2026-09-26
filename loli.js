/*
 * @name         LOLI Labs 自动签到
 * @description  自动捕获已登录 LOLI 的 Token，并定时签到
 * @author       Eric
 * @version      2.0.0
 */

const LOLI_API = "https://labs-api.loli.host/api/v1";
const TOKEN_KEY = "LOLI_TOKEN";

function notify(subtitle, message) {
    $notification.post("LOLI Labs", subtitle, message);
}

function saveToken(token) {
    if (!token) return false;

    token = token
        .replace(/^Bearer\s+/i, "")
        .trim();

    if (!token) return false;

    $persistentStore.write(token, TOKEN_KEY);

    console.log("LOLI Token 已保存");
    return true;
}

function getToken() {
    // 优先使用模块参数
    if (typeof $argument !== "undefined" && $argument) {
        const match = $argument.match(/(?:^|&)Token=([^&]*)/);

        if (match && match[1]) {
            const token = decodeURIComponent(match[1]).trim();

            if (token) {
                return token;
            }
        }
    }

    return $persistentStore.read(TOKEN_KEY);
}

function httpRequest(options) {
    return new Promise((resolve, reject) => {
        $httpClient[options.method.toLowerCase()](
            options,
            (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }

                let data;

                try {
                    data = JSON.parse(body);
                } catch {
                    data = body;
                }

                resolve({
                    status: response.status,
                    body: data
                });
            }
        );
    });
}


// ========================================
// HTTP Request：捕获已经登录的 LOLI Token
// ========================================

if ($script.type === "http-request") {

    const headers = $request.headers || {};

    const authorization =
        headers.Authorization ||
        headers.authorization;

    if (
        authorization &&
        /^Bearer\s+/i.test(authorization)
    ) {

        const token = authorization
            .replace(/^Bearer\s+/i, "")
            .trim();

        if (saveToken(token)) {

            console.log(
                "捕获 LOLI Authorization 成功"
            );

        }
    }

    $done({});
    return;
}


// ========================================
// Cron：自动签到
// ========================================

async function signin() {

    const token = getToken();

    if (!token) {

        console.log(
            "没有 LOLI Token"
        );

        notify(
            "签到失败",
            "没有找到 LOLI Token，请先打开 LOLI Labs"
        );

        $done();
        return;
    }

    console.log(
        "开始 LOLI 签到"
    );

    try {

        // ----------------------------
        // 查询签到状态
        // ----------------------------

        const status = await httpRequest({
            url: `${LOLI_API}/signin/status`,
            method: "GET",

            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
                "Origin": "https://loli.host",
                "Referer": "https://loli.host/"
            }
        });

        console.log(
            "签到状态:",
            JSON.stringify(status.body)
        );


        // ----------------------------
        // 执行签到
        // ----------------------------

        const result = await httpRequest({
            url: `${LOLI_API}/signin`,
            method: "POST",

            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": "https://loli.host",
                "Referer": "https://loli.host/"
            },

            body: "{}"
        });

        console.log(
            "签到返回:",
            JSON.stringify(result.body)
        );


        // ----------------------------
        // 成功
        // ----------------------------

        if (
            result.body &&
            result.body.code === 0
        ) {

            const data =
                result.body.data || {};

            const primogems =
                data.primogems ?? 0;

            const totalDays =
                data.total_days ?? "?";

            notify(
                "签到成功",
                `+${primogems} 原石，累计 ${totalDays} 天`
            );

            $done();
            return;
        }


        // ----------------------------
        // 已签到
        // ----------------------------

        const message =
            result.body?.message || "";

        if (
            /already|signed/i.test(message)
        ) {

            notify(
                "今日已签到",
                message
            );

            $done();
            return;
        }


        // ----------------------------
        // Token 无效
        // ----------------------------

        if (
            result.status === 401 ||
            result.body?.code === 40100
        ) {

            $persistentStore.write(
                "",
                TOKEN_KEY
            );

            notify(
                "Token 已失效",
                "请重新打开 LOLI Labs 获取 Token"
            );

            $done();
            return;
        }


        // ----------------------------
        // 其他错误
        // ----------------------------

        notify(
            "签到失败",
            message ||
            `HTTP ${result.status}`
        );

    } catch (error) {

        console.log(
            "签到异常:",
            error
        );

        notify(
            "签到异常",
            String(error)
        );
    }

    $done();
}

signin();
