// ============================================
// LOLI Labs 自动签到
// Yuusei 登录 → OAuth → LOLI Token → 签到
// Surge Script
// ============================================

const ACCOUNTS = $argument.Accounts || "";

const CLIENT_ID = "db263ae26378aa73506379493e7db349";
const REDIRECT_URI = "https://loli.host/auth/callback";
const SCOPE = "profile email";

const YUUSEI_API = "https://isp-api.yuusei.io/api/v1";
const LOLI_API = "https://labs-api.loli.host/api/v1";

function request(options) {
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
                    headers: response.headers,
                    body: data
                });
            }
        );
    });
}

function randomState() {
    return Math.random().toString(36).substring(2) +
           Date.now().toString(36);
}

// ============================================
// Yuusei 登录
// 不发送 captcha_token
// ============================================

async function yuuseiLogin(email, password) {

    const result = await request({
        url: `${YUUSEI_API}/auth/login`,
        method: "POST",
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

    if (!result.body || result.body.code !== 0) {
        throw new Error(
            `Yuusei 登录失败: ${
                result.body?.message || `HTTP ${result.status}`
            }`
        );
    }

    const token = result.body.data?.token?.access_token;

    if (!token) {
        throw new Error("Yuusei 登录成功，但没有获取 access_token");
    }

    return token;
}

// ============================================
// Yuusei OAuth 授权
// ============================================

async function yuuseiOAuth(yuuseiToken) {

    const state = randomState();

    const consent = await request({
        url:
            `${YUUSEI_API}/oauth/consent` +
            `?client_id=${encodeURIComponent(CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&scope=${encodeURIComponent(SCOPE)}`,
        method: "GET",
        headers: {
            "Authorization": `Bearer ${yuuseiToken}`,
            "Accept": "application/json",
            "Origin": "https://yuusei.io",
            "Referer": "https://yuusei.io/"
        }
    });

    if (!consent.body || consent.body.code !== 0) {
        throw new Error(
            `获取 OAuth 信息失败: ${
                consent.body?.message || `HTTP ${consent.status}`
            }`
        );
    }

    const approve = await request({
        url: `${YUUSEI_API}/oauth/consent`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${yuuseiToken}`,
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

    if (!approve.body || approve.body.code !== 0) {
        throw new Error(
            `OAuth 授权失败: ${
                approve.body?.message || `HTTP ${approve.status}`
            }`
        );
    }

    const redirectUrl = approve.body.data?.redirect_url;

    if (!redirectUrl) {
        throw new Error("OAuth 没有返回 redirect_url");
    }

    const url = new URL(redirectUrl);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    if (!code) {
        throw new Error("OAuth 没有获取 authorization code");
    }

    return {
        code,
        state: returnedState || state
    };
}

// ============================================
// LOLI 获取 Token
// ============================================

async function loliCallback(code, state) {

    const result = await request({
        url: `${LOLI_API}/auth/oauth/callback`,
        method: "POST",
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

    if (!result.body || result.body.code !== 0) {
        throw new Error(
            `LOLI OAuth 登录失败: ${
                result.body?.message || `HTTP ${result.status}`
            }`
        );
    }

    const token =
        result.body.data?.token?.access_token;

    if (!token) {
        throw new Error("LOLI OAuth 成功，但没有获取 access_token");
    }

    return token;
}

// ============================================
// LOLI 签到
// ============================================

async function loliSignin(token) {

    const result = await request({
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

    if (!result.body) {
        throw new Error("LOLI 签到无返回");
    }

    if (result.body.code !== 0) {

        // 已签到也视为正常状态
        if (
            result.body.message &&
            /already|signed/i.test(result.body.message)
        ) {
            return {
                success: true,
                message: result.body.message
            };
        }

        throw new Error(
            `签到失败: ${
                result.body.message || `HTTP ${result.status}`
            }`
        );
    }

    return {
        success: true,
        data: result.body.data
    };
}

// ============================================
// 单账号
// ============================================

async function runAccount(account, index) {

    const parts = account.split(":");

    if (parts.length < 2) {
        throw new Error("账号格式错误，应为 邮箱:密码");
    }

    const email = parts.shift().trim();
    const password = parts.join(":").trim();

    if (!email || !password) {
        throw new Error("邮箱或密码为空");
    }

    console.log(`账号 ${index}：开始登录`);

    // 1. Yuusei 登录
    const yuuseiToken =
        await yuuseiLogin(email, password);

    console.log(`账号 ${index}：Yuusei 登录成功`);

    // 2. OAuth
    const oauth =
        await yuuseiOAuth(yuuseiToken);

    console.log(`账号 ${index}：OAuth 授权成功`);

    // 3. LOLI Token
    const loliToken =
        await loliCallback(
            oauth.code,
            oauth.state
        );

    console.log(`账号 ${index}：LOLI 登录成功`);

    // 4. 签到
    const result =
        await loliSignin(loliToken);

    if (result.data) {

        const data = result.data;

        console.log(
            `账号 ${index}：签到成功 ` +
            `+${data.primogems ?? "?"} 原石，` +
            `累计 ${data.total_days ?? "?"} 天`
        );

        return `账号${index}：签到成功 +${data.primogems ?? "?"} 原石，累计${data.total_days ?? "?"}天`;

    } else {

        console.log(
            `账号 ${index}：${result.message || "签到完成"}`
        );

        return `账号${index}：${result.message || "签到完成"}`;
    }
}

// ============================================
// 主程序
// ============================================

async function main() {

    if (!ACCOUNTS.trim()) {
        $notification.post(
            "LOLI Labs",
            "",
            "没有配置 Accounts"
        );
        $done();
        return;
    }

    const accounts =
        ACCOUNTS
            .split(";")
            .map(x => x.trim())
            .filter(Boolean);

    const results = [];

    for (let i = 0; i < accounts.length; i++) {

        try {

            const result =
                await runAccount(
                    accounts[i],
                    i + 1
                );

            results.push(result);

        } catch (error) {

            console.log(
                `账号 ${i + 1}：${error.message}`
            );

            results.push(
                `账号${i + 1}：失败 - ${error.message}`
            );
        }
    }

    $notification.post(
        "LOLI Labs 自动签到",
        "",
        results.join("\n")
    );

    $done();
}

main();
