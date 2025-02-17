const fs = require("fs");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

const config = {
  "apiBaseUrl": "https://api.hivello.services",
};
// 生成 6 到 7 分钟之间的随机秒数
const minMinutes = 6;
const maxMinutes = 7;

// 将分钟转换为秒
const minSeconds = minMinutes * 60; // 360 秒
const maxSeconds = maxMinutes * 60; // 420 秒

function loadProxies() {
  try {
    const proxiesContent = fs.readFileSync("proxy.txt", "utf8");
    return proxiesContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((proxy) => proxy); // 保留完整的代理URL
  } catch (error) {
    console.error("加载代理时出错:", error.message);
    return [];
  }
}

function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;

  try {
    if (proxyUrl.startsWith("socks4://") || proxyUrl.startsWith("socks5://")) {
      return new SocksProxyAgent(proxyUrl);
    } else if (proxyUrl.startsWith("http://")) {
      return new HttpsProxyAgent(proxyUrl);
    }
  } catch (error) {
    console.error("创建代理代理时出错:", error.message);
    return null;
  }
  return null;
}

function createApiClient(token, proxyUrl) {
  const agent = createProxyAgent(proxyUrl);

  return axios.create({
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Hivello/1.4.0 Chrome/124.0.6367.230 Electron/30.0.8 Safari/537.36",
      "sec-ch-ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
    timeout: 10000,
    ...(agent && { httpsAgent: agent, httpAgent: agent }),
  });
}

function loadDevices() {
  try {
    const devicesContent = fs.readFileSync("devices.txt", "utf8");
    return devicesContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [deviceId, token, label] = line.split("|").map((s) => s.trim());
        return {
          deviceId,
          token,
          label: label || deviceId, // 如果未提供标签，则使用设备ID
        };
      });
  } catch (error) {
    console.error("加载设备时出错:", error.message);
    process.exit(1);
  }
}

async function updateDevicePing(client, device) {
  const networkStatus = [
    { "chain": "aioz", "earning": true },
    { "chain": "filecoin", "earning": true },
    { "chain": "golem", "earning": true },
    { "chain": "livepeer", "earning": false },
    { "chain": "myst", "earning": true },
    { "chain": "nosana", "earning": true },
    { "chain": "pkt", "earning": true },
    { "chain": "sentinel", "earning": true },
  ];

  try {
    await client.post(`${config.apiBaseUrl}/devices/${device.deviceId}/ping`, {
      status: "Earning",
      network_status: networkStatus,
    });
    console.log(`[${device.label}] 设备 ping 更新成功`);
    return true;
  } catch (error) {
    console.error(`[${device.label}] 更新设备 ping 时出错:`, error.message);
    return false;
  }
}

async function miningLoop(devices, useProxy) {
  let cycleCount = 0;
  const proxies = useProxy ? loadProxies() : [];
  let currentProxyIndex = 0;

  while (true) {
    try {
      cycleCount++;
      console.log("\n=== 开始挖矿周期 #" + cycleCount + " ===");
      const timestamp = new Date().toLocaleString();
      console.log(`时间: ${timestamp}`);

      for (const device of devices) {
        let proxyUrl = null;
        if (useProxy && proxies.length > 0) {
          proxyUrl = proxies[currentProxyIndex];
          // 在日志中隐藏密码
          const displayUrl = proxyUrl.replace(
            /\/\/(.*):(.*)@/,
            "//*****:*****@"
          );
          console.log(`[${device.label}] 使用代理: ${displayUrl}`);
          currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
        }

        const client = createApiClient(device.token, proxyUrl);
        const pingOk = await updateDevicePing(client, device);

        if (pingOk) {
          console.log(`[${device.label}] Ping 周期成功完成`);
        } else {
          console.log(`[${device.label}] Ping 周期失败，将在下一个周期重试`);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const randomSeconds =
        Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
      console.log(`等待 ${randomSeconds} 秒后进入下一个周期...`);
      await new Promise((resolve) => setTimeout(resolve, randomSeconds * 1000));
    } catch (error) {
      console.error("挖矿循环中出错:", error.message);
      await new Promise((resolve) => setTimeout(resolve, randomSeconds * 1000));
    }
  }
}

async function promptProxyUsage() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) =>
    new Promise((resolve) => readline.question(query, resolve));

  console.log("\n代理配置:");
  console.log("1. 不使用代理");
  console.log("2. 使用 proxy.txt 中的代理");

  const choice = await question("选择选项 (1-2): ");
  readline.close();

  return choice === "2";
}

async function runBot() {
  console.log("启动 Hivello 挖矿机器人...");
  console.log("从 devices.txt 加载设备...");

  const devices = loadDevices();
  console.log(`加载了 ${devices.length} 台设备:`);
  devices.forEach((device) => {
    console.log(`- ${device.label} (${device.deviceId})`);
  });

  const useProxy = await promptProxyUsage();
  if (useProxy) {
    const proxies = loadProxies();
    console.log(`从 proxy.txt 加载了 ${proxies.length} 个代理`);
  } else {
    console.log("不使用代理运行");
  }

  console.log("按 Ctrl+C 停止机器人");
  await miningLoop(devices, useProxy);
}

process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("未处理的拒绝:", error);
});

process.on("SIGINT", () => {
  console.log("\n正在优雅地关闭...");
  process.exit(0);
});

runBot().catch((error) => {
  console.error("机器人错误:", error);
  process.exit(1);
});
