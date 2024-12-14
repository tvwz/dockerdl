# Cloudflare-群晖Docker仓库镜像
这个项目是一个基于 Cloudflare Workers 的 群晖Docker 镜像代理，它能够解决群晖docker镜像拉取问题，支持在群晖注册表搜索以及选择对应版本号下载镜像。
## 部署方式

| 变量名 | 示例 | 必填 | 备注 | 
|--|--|--|--|
| URL302 | https://t.me/yikouqing |❌| 主页302跳转 |
| URL | https://www.baidu.com/ |❌| 主页伪装(设为`nginx`则伪装为nginx默认页面) |
| UA | netcraft |❌| 支持多元素, 元素之间使用空格或换行作间隔 |

## 部署方式

- **Workers** 部署：复制 [_worker.js](https://github.com/yikouqing/Workers-Docker/blob/main/_worker.js) 代码，`保存并部署`即可
- **Pages** 部署：`Fork` 后 `连接GitHub` 一键部署即可

## 如何使用？ [视频教程](https://www.youtube.com/watch?v=6Wsa1aSMldc)

例如您的Workers项目域名为：`docker.ios321.us.kg`；5

### 1.官方镜像路径前面加域名
```shell
docker pull docker.ios321.us.kg/stilleshan/frpc:latest
```
```shell
docker pull docker.ios321.us.kg/library/nginx:stable-alpine3.19-perl
```

### 2.一键设置镜像加速
修改文件 `/etc/docker/daemon.json`（如果不存在则创建）
```shell
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://docker.ios321.us.kg"]  # 请替换为您自己的Worker自定义域名
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
