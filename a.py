from flask import Flask, send_from_directory, request, jsonify
import os

app = Flask(__name__)
CUR_DIR = os.getcwd()

# 路由：访问主页
@app.route('/')
def index():
    return send_from_directory(CUR_DIR, 'index.html')

# 路由：自动加载所有静态文件 (js, css, images)
@app.route('/<path:path>')
def send_static(path):
    return send_from_directory(CUR_DIR, path)

if __name__ == '__main__':
    # 允许局域网访问，端口 8080
    app.run(host='0.0.0.0', port=8080, debug=True)
    