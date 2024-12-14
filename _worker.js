// _worker.js

// Docker镜像仓库主机地址
let hub_host = 'registry-1.docker.io';
// Docker认证服务器地址
const auth_url = 'https://auth.docker.io';
// 自定义的工作服务器地址
let workers_url = '';

let 屏蔽爬虫UA = ['netcraft', 'golang', 'python'];

// 根据主机名选择对应的上游地址
function routeByHosts(host) {
	// 定义路由表
	const routes = {
		// 生产环境
		"/v1/search": "registry.hub.docker.com",
		"/token": auth_url
	};

	if (host in routes) return [routes[host], false];
	else return [hub_host, true];
}

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
	// 预检请求配置
	headers: new Headers({
		'access-control-allow-origin': '*', // 允许所有来源
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS', // 允许的HTTP方法
		'access-control-max-age': '1728000', // 预检请求的缓存时间
	}),
}

/**
 * 构造响应
 * @param {any} body 响应体
 * @param {number} status 响应状态码
 * @param {Object<string, string>} headers 响应头
 */
function makeRes(body, status = 200, headers = {}) {
	headers['access-control-allow-origin'] = '*' // 允许所有来源
	return new Response(body, { status, headers }) // 返回新构造的响应
}

/**
 * 构造新的URL对象
 * @param {string} urlStr URL字符串
 */
function newUrl(urlStr) {
	try {
		return new URL(urlStr) // 尝试构造新的URL对象
	} catch (err) {
		return null // 构造失败返回null
	}
}

function isUUID(uuid) {
	// 定义一个正则表达式来匹配 UUID 格式
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

	// 使用正则表达式测试 UUID 字符串
	return uuidRegex.test(uuid);
}

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text;
}

async function getToken(target) {
	// console.log('auth',`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${target}:*`)
	const response = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${target}:*`, {
		method: 'GET',
		headers: {
			'Host': 'auth.docker.io',
			'Accept': '*/*',
			'Accept-Encoding': 'gzip, br'
		}
	});

	if (!response.ok) {
		throw new Error('Failed to get token: ' + response.statusText);
	}

	const data = await response.json();
	// console.log('token', data.token)
	return data.token.toString().trim(); // 返回 token
}

export default {
	async fetch(request, env, ctx) {
		const getReqHeader = (key) => request.headers.get(key); // 获取请求头

		let url = new URL(request.url); // 解析请求URL
		const userAgentHeader = request.headers.get('User-Agent');
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null";
		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA));
		workers_url = `https://${url.hostname}`;
		const pathname = url.pathname;
		// console.log('path',pathname)
		let checkHost = routeByHosts(pathname);
		hub_host = checkHost[0];

		// const fakePage = checkHost ? checkHost[1] : false; // 确保 fakePage 不为 undefined
		const fakePage = pathname === '/'
		const isUuid = isUUID(pathname.split('/')[1].split('/')[0]);

		if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
			// 首页改成一个nginx伪装页
			return new Response(await nginx(), {
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
				},
			});
		}

		const conditions = [
			isUuid,
			pathname.includes('/_'),
			pathname.includes('/r/'),
			pathname.includes('/v2/'),
			pathname.includes('/v1/'),
			pathname.includes('token'),
			pathname.includes('search'),
			pathname.includes('source'),
			pathname == '/',
			pathname == '/favicon.ico',
			pathname == '/auth/profile',
		];

		if (!conditions.some(condition => condition) || (fakePage === true)) {
			// console.log('start fake')
			if (env.URL302) {
				return Response.redirect(env.URL302, 302);
			} else if (env.URL) {
				if (env.URL.toLowerCase() == 'nginx') {
					//首页改成一个nginx伪装页
					return new Response(await nginx(), {
						headers: {
							'Content-Type': 'text/html; charset=UTF-8',
						},
					});
				} else return fetch(new Request(env.URL, request));
			}
		}

		if (pathname.includes('/v1/search') && url.search.includes('library/') && !url.search.match(/library\/(&|$)/)) {
			url.search = url.search.replace('library/', '');
		}

		// 修改包含 %2F 和 %3A 的请求
		if (!/%2F/.test(url.search) && /%3A/.test(url.toString())) {
			let modifiedUrl = url.toString().replace(/%3A(?=.*?&)/, '%3Alibrary%2F');
			url = new URL(modifiedUrl);
			// console.log(`handle_url: ${url}`);
		}

		// 处理token请求
		if (url.pathname.includes('/token')) {
			let token_parameter = {
				headers: {
					'Host': 'auth.docker.io',
					'User-Agent': getReqHeader("User-Agent"),
					'Accept': getReqHeader("Accept"),
					'Accept-Language': getReqHeader("Accept-Language"),
					'Accept-Encoding': getReqHeader("Accept-Encoding"),
					'Connection': 'keep-alive',
					'Cache-Control': 'max-age=0'
				}
			};
			let token_url = auth_url + url.pathname + url.search;
			return fetch(new Request(token_url, request), token_parameter);
		}


		// 更改请求的主机名
		url.hostname = hub_host;

		// 构造请求参数
		let parameter = {
			headers: {
				'Host': hub_host,
				'User-Agent': getReqHeader("User-Agent"),
				'Accept': getReqHeader("Accept"),
				'Accept-Language': getReqHeader("Accept-Language"),
				'Accept-Encoding': getReqHeader("Accept-Encoding"),
				'Connection': 'keep-alive',
				'Cache-Control': 'max-age=0'
			},
			cacheTtl: 3600 // 缓存时间
		};

		// 添加Authorization头
		if (request.headers.has("Authorization")) {
			parameter.headers.Authorization = getReqHeader("Authorization");
		}

		if (/^\/v2\/[^/]+\/[^/]+\/list$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
			const parts = url.pathname.split('/');
			const repository = parts[2]; // 提取命名空间
			const tags = parts[3]; // 提取仓库名
			url.pathname = `/v2/library/${repository}/${tags}/list`;
			// console.log(`search_url_1: ${url.pathname}`);
			const token = await getToken(`library/${repository}`)
			url.hostname = 'index.docker.io'
			parameter.headers.Host = url.hostname
			parameter.headers.Authorization = `Bearer ${token}`
		}
		else if (/^\/v2\/[^/]+\/[^/]+\/[^/]+\/list$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
			const parts = url.pathname.split('/');
			const namespace = parts[2]
			const repository = parts[3]; // 提取命名空间
			const tags = parts[4]; // 提取仓库名
			url.pathname = `/v2/${namespace}/${repository}/${tags}/list`;
			// console.log(`search_url_2: ${url.pathname}`);
			const token = await getToken(`${namespace}/${repository}`)
			url.hostname = 'index.docker.io'
			parameter.headers.Host = url.hostname
			parameter.headers.Authorization = `Bearer ${token}`
		}
		else if (hub_host == 'registry-1.docker.io' && /^\/v2\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname) && !/^\/v2\/library/.test(url.pathname)) {
			//url.pathname = url.pathname.replace(/\/v2\//, '/v2/library/');
			url.pathname = '/v2/library/' + url.pathname.split('/v2/')[1];
			// console.log(`modified_url: ${url.pathname}`);
		}
		// 发起请求并处理响应
		const r = {
			method: request.method,
			headers: {
				...parameter.headers
			}
		};

		const req = new Request(url, r);
		// console.log('Url',JSON.stringify(url,null,2))
		// console.log('Request', req.url, JSON.stringify(parameter.headers, null, 2))

		let original_response = await fetch(req);
		// console.log('Response Status:', original_response.status);

		// let original_response = await fetch(new Request(url, request), parameter);
		let original_response_clone = original_response.clone();

		// 获取响应体
		// const responseBody = await original_response.text();
		// console.log('Response Body:', responseBody);

		let original_text = original_response_clone.body;
		let response_headers = original_response.headers;
		let new_response_headers = new Headers(response_headers);
		let status = original_response.status;

		// 修改 Www-Authenticate 头
		if (new_response_headers.get("Www-Authenticate")) {
			let auth = new_response_headers.get("Www-Authenticate");
			let re = new RegExp(auth_url, 'g');
			new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
		}

		// 处理重定向
		if (new_response_headers.get("Location")) {
			return httpHandler(request, new_response_headers.get("Location"));
		}

		// 返回修改后的响应
		let response = new Response(original_text, {
			status,
			headers: new_response_headers
		});
		return response;
	}
};

/**
 * 处理HTTP请求
 * @param {Request} req 请求对象
 * @param {string} pathname 请求路径
 */
function httpHandler(req, pathname) {
	const reqHdrRaw = req.headers;

	// 处理预检请求
	if (req.method === 'OPTIONS' &&
		reqHdrRaw.has('access-control-request-headers')
	) {
		return new Response(null, PREFLIGHT_INIT);
	}

	let rawLen = '';

	const reqHdrNew = new Headers(reqHdrRaw);

	const refer = reqHdrNew.get('referer');

	let urlStr = pathname;

	const urlObj = newUrl(urlStr);

	/** @type {RequestInit} */
	const reqInit = {
		method: req.method,
		headers: reqHdrNew,
		redirect: 'follow',
		body: req.body
	};
	return proxy(urlObj, reqInit, rawLen);
}

/**
 * 代理请求
 * @param {URL} urlObj URL对象
 * @param {RequestInit} reqInit 请求初始化对象
 * @param {string} rawLen 原始长度
 */
async function proxy(urlObj, reqInit, rawLen) {
	const res = await fetch(urlObj.href, reqInit);
	const resHdrOld = res.headers;
	const resHdrNew = new Headers(resHdrOld);

	// 验证长度
	if (rawLen) {
		const newLen = resHdrOld.get('content-length') || '';
		const badLen = (rawLen !== newLen);

		if (badLen) {
			return makeRes(res.body, 400, {
				'--error': `bad len: ${newLen}, except: ${rawLen}`,
				'access-control-expose-headers': '--error',
			});
		}
	}
	const status = res.status;
	resHdrNew.set('access-control-expose-headers', '*');
	resHdrNew.set('access-control-allow-origin', '*');
	resHdrNew.set('Cache-Control', 'max-age=1500');

	// 删除不必要的头
	resHdrNew.delete('content-security-policy');
	resHdrNew.delete('content-security-policy-report-only');
	resHdrNew.delete('clear-site-data');

	return new Response(res.body, {
		status,
		headers: resHdrNew
	});
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	 |"'\r\n]+/g, ',').replace(/,+/g, ',');	// 将空格、双引号、单引号和换行符替换为逗号
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}
