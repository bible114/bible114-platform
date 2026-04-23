/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            animation: {
                wiggle: 'wiggle 0.3s ease-in-out infinite',
                float: 'float 6s ease-in-out infinite',
                'float-slow': 'float 10s ease-in-out infinite',
            },
            keyframes: {
                wiggle: {
                    '0%, 100%': { transform: 'rotate(-3deg) scale(1.1)' },
                    '50%': { transform: 'rotate(3deg) scale(1.1)' },
                },
                float: {
                    '0%': { transform: 'translateX(0px)' },
                    '50%': { transform: 'translateX(10px)' },
                    '100%': { transform: 'translateX(0px)' },
                }
            }
        },
    },
    plugins: [
        require('tailwind-scrollbar-hide')
    ],
}
