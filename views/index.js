<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %></title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .post { border: 1px solid #ddd; padding: 15px; margin: 10px 0; }
        .nav { margin: 20px 0; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Lichu App</h1>
        <div class="nav">
            <a href="/">Home</a>
            <a href="/admission-info">Admission Info</a>
            <% if (user) { %>
                <a href="/16192224">Admin</a>
                <a href="/logout">Logout (<%= user.username %>)</a>
            <% } else { %>
                <a href="/login">Login</a>
            <% } %>
            <a href="/health">Health</a>
            <a href="/api/db-test">DB Test</a>
        </div>
    </div>
    
    <h2>Latest Posts</h2>
    <% if (posts && posts.length > 0) { %>
        <% posts.forEach(post => { %>
            <div class="post">
                <h3><a href="/post/<%= post.slug %>"><%= post.title %></a></h3>
                <p><%= post.content?.substring(0, 100) %>...</p>
                <small>Posted: <%= new Date(post.created_at).toLocaleDateString() %></small>
            </div>
        <% }); %>
    <% } else { %>
        <p>No posts yet. <a href="/login">Login</a> to create posts.</p>
    <% } %>
    
    <hr>
    <footer>
        <p>Lichu App &copy; <%= new Date().getFullYear() %></p>
    </footer>
</body>
</html>
