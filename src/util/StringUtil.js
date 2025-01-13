
export const getCookieValue =(name,cookieString) => {
    const cookies = cookieString.split("; ");
    for (const cookie of cookies) {
        const [key, value] = cookie.split("=");
        if (key === name) {
            return decodeURIComponent(value);
        }
    }
    return null; // 如果未找到，返回 null
}
