/**
 * @name         LOLI Labs 自动签到
 * @description  Yuusei 邮箱密码登录 → OAuth 授权 → 获取 LOLI Token → 自动签到
 * @author       Eric
 * @version      2.0.0
 */
const YUUSEI_LOGIN = "https://isp-api.yuusei.io/api/v1/auth/login";
const YUUSEI_CONSENT = "https://isp-api.yuusei.io/api/v1/oauth/consent";
const LOLI_CALLBACK = "https://labs-api.loli.host/api/v1/auth/oauth/callback";
const LOLI_SIGNIN = "https://labs-api.loli.host/api/v1/signin";
const CLIENT_ID = "db263ae26378aa73506379493e7db349";
const REDIRECT_URI = "https://loli.host/auth/callback";
const SCOPE = "profile email";
/***********************
 * 解析 Surge 参数
 ***********************/
function getAccounts() {
    const args = {};
    const argument = $argument || "";
    argument.split("&").forEach(item => {
        const index = item.indexOf("=");
        if (index === -1) return;
        const key = item.substring(0, index);
        const value = item.substring(index + 1);
        args[key] = decodeURIComponent(value);
    });
    return (args.Accounts || "")
        .split(";")
        .map(x => x.trim())
        .filter(Boolean);
}
/***********************
 * Surge HTTP 封装
 ***********************/
function request(options) {
    return new Promise((resolve, reject) => {
        $httpClient[options.method.toLowerCase()](options, (error, response, body) => {
            if (error) {
                reject(error);
                return;
            }
            resolve({
                response: response,
                body: body
            });
        });
    });
}
/***********************
 * 随机 State
 ***********************/
function randomState(length = 32) {
    const chars =
        "abcdefghijklmnopqrstuvwxyz" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(
            Math.floor(Math.random() * chars.length)
        );
    }
    return result;
}
/***********************
 * JSON 解析
 ***********************/
function parseJSON(body) {
    try {
        return JSON.parse(body);
    } catch (e) {
        return null;
    }
}
/***********************
 * Yuusei 登录
 ***********************/
async function yuuseiLogin(email, password) {
    const result = await request({
        method: "POST",
        url: YUUSEI_LOGIN,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://yuusei.io",
            "Referer": "https://yuusei.io/"
        },
        body: JSON.stringify({
            email: email,
            password: password
        })
    });
    const data = parseJSON(result.body);
    if (!data || data.code !== 0) {
        throw new Error(
            data && data.message
                ? data.message
                : "Yuusei 登录失败"
        );
    }
    if (
        !data.data ||
        !data.data.token ||
        !data.data.token.access_token
    ) {
        throw new Error("未获取到 Yuusei Token");
    }
    if (
        data.data.two_factor_required === true
    ) {
        throw new Error("该账号开启了二次验证，暂不支持自动登录");
    }
    return data.data.token.access_token;
}
/***********************
 * OAuth Consent
 ***********************/
async function oauthConsent(yuuseiToken) {
    const state = randomState();
    const result = await request({
        method: "POST",
        url: YUUSEI_CONSENT,
        headers: {
            "Authorization": "Bearer " + yuuseiToken,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://yuusei.io",
            "Referer": "https://yuusei.io/"
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            state: state,
            approve: true
        })
    });
    const data = parseJSON(result.body);
    if (!data || data.code !== 0) {
        throw new Error(
            data && data.message
                ? data.message
                : "OAuth 授权失败"
        );
    }
    const redirectUrl =
        data.data &&
        data.data.redirect_url;
    if (!redirectUrl) {
        throw new Error("OAuth 未返回 redirect_url");
    }
    return {
        redirectUrl: redirectUrl,
        state: state
    };
}
/***********************
 * 从 redirect_url 提取 code/state
 ***********************/
function parseCallbackUrl(url) {
    const match = url.match(
        /[?&]code=([^&]+)/
    );
    const stateMatch = url.match(
        /[?&]state=([^&]+)/
    );
    if (!match || !stateMatch) {
        throw new Error("无法从 redirect_url 获取 code/state");
    }
    return {
        code: decodeURIComponent(match[1]),
        state: decodeURIComponent(stateMatch[1])
    };
}
/***********************
 * LOLI OAuth 换 Token
 ***********************/
async function getLoliToken(code, state) {
    const result = await request({
        method: "POST",
        url: LOLI_CALLBACK,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://loli.host",
            "Referer": "https://loli.host/"
        },
        body: JSON.stringify({
            code: code,
            state: state
        })
    });
    const data = parseJSON(result.body);
    if (!data || data.code !== 0) {
        throw new Error(
            data && data.message
                ? data.message
                : "LOLI Token 获取失败"
        );
    }
    if (
        !data.data ||
        !data.data.token ||
        !data.data.token.access_token
    ) {
        throw new Error("未获取到 LOLI Token");
    }
    return data.data.token.access_token;
}
/***********************
 * LOLI 签到
 ***********************/
async function signin(loliToken) {
    const result = await request({
        method: "POST",
        url: LOLI_SIGNIN,
        headers: {
            "Authorization": "Bearer " + loliToken,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": "https://loli.host",
            "Referer": "https://loli.host/"
        },
        body: ""
    });
    const data = parseJSON(result.body);
    if (!data) {
        throw new Error("签到返回数据异常");
    }
    if (data.code === 0) {
        const info = data.data || {};
        return (
            "签到成功" +
            "，+" +
            (info.primogems || 0) +
            " 原石" +
            "，累计 " +
            (info.total_days || 0) +
            " 天"
        );
    }
    return data.message || "签到失败";
}
/***********************
 * 单账号
 ***********************/
async function processAccount(account, index) {
    const separator = account.indexOf(":");
    if (separator === -1) {
        return `账号${index + 1}：格式错误`;
    }
    const email = account.substring(0, separator).trim();
    const password = account.substring(separator + 1);
    if (!email || !password) {
        return `账号${index + 1}：邮箱或密码为空`;
    }
    try {
        // 1. Yuusei 登录
        const yuuseiToken =
            await yuuseiLogin(
                email,
                password
            );
        // 2. OAuth 授权
        const oauth =
            await oauthConsent(
                yuuseiToken
            );
        // 3. 获取 code + state
        const callback =
            parseCallbackUrl(
                oauth.redirectUrl
            );
        // 4. LOLI Token
        const loliToken =
            await getLoliToken(
                callback.code,
                callback.state
            );
        // 5. LOLI 签到
        const message =
            await signin(loliToken);
        return `账号${index + 1}：${message}`;
    } catch (error) {
        return (
            `账号${index + 1}：失败 - ` +
            (error.message || "未知错误")
        );
    }
}
/***********************
 * 主程序
 ***********************/
async function main() {
    const accounts = getAccounts();
    if (accounts.length === 0) {
        $notification.post(
            "LOLI Labs 自动签到",
            "",
            "未配置账号"
        );
        $done();
        return;
    }
    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        const result =
            await processAccount(
                accounts[i],
                i
            );
        results.push(result);
    }
    $notification.post(
        "LOLI Labs 自动签到",
        "",
        results.join("\n")
    );
    $done();
}
main();
