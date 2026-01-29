// meta.js

const metaTags = {
    home: {
        title: "Home - Arafat's",
        description: "Welcome to Arafat's homepage.",
        keywords: "homepage, arafat, welcome",
        author: "Arafat Rahman",
        og: {
            title: "Home - Arafat's",
            description: "Welcome to Arafat's homepage.",
            image: "/path/to/image.jpg", // Update the path as necessary
            url: "http://yourdomain.com/",
        },
    },
    login: {
        title: "Login - Arafat's",
        description: "Login to your account.",
        keywords: "login, arafat",
        author: "Arafat Rahman",
        og: {
            title: "Login - Arafat's",
            description: "Login to your account.",
            image: "/path/to/image.jpg", // Update the path as necessary
            url: "http://yourdomain.com/l",
        },
    },
    register: {
        title: "Register - Arafat's",
        description: "Create a new account.",
        keywords: "register, arafat",
        author: "Arafat Rahman",
        og: {
            title: "Register - Arafat's",
            description: "Create a new account.",
            image: "/path/to/image.jpg", // Update the path as necessary
            url: "http://yourdomain.com/r",
        },
    },
    // Add other pages as needed
};

module.exports = metaTags;