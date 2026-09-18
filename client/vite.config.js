import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
        proxy: {
            "/api": "http://127.0.0.1:5000",
            "/uploads": "http://127.0.0.1:5000",
        },
    },
    plugins: [react(), tailwindcss()],
})
