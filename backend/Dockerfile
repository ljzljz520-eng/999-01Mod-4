FROM php:8.2-apache

# 启用 Rewrite 模块
RUN a2enmod rewrite

# 安装 PDO MySQL 扩展
RUN docker-php-ext-install pdo pdo_mysql

# 设置工作目录
WORKDIR /var/www/html

# 更改 Apache 文档根目录（可选，如果代码直接在 html 下则不需要）
# 这里我们将 /var/www/html 作为根目录，代码结构对应

# 这一步是必须的，确保 www-data 用户可以写入 data 目录（如果是容器内由于初始化创建的）
# 但由于我们挂载了 volume，权限可能需要调节。
# 我们在启动时确保 /app/data 可写，或者使用 /var/www/html/data

# 复制源代码
COPY . /var/www/html/

# 设置权限，确保 Apache 用户可以写入 (关键步骤)
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# 暴露端口
EXPOSE 80
