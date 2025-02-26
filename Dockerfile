
# 使用 Nginx 1.22 作为基础镜像
FROM nginx:1.22


RUN rm /etc/nginx/conf.d/default.conf


COPY /dist /usr/share/nginx/html/spa


COPY nginx.conf /etc/nginx/nginx.conf


EXPOSE 80


CMD ["nginx", "-g", "daemon off;"]


