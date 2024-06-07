// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8000;
const filePath = path.join(__dirname, '../scripts/utils.js');

const server = http.createServer((req, res) => {
    if (req.url === '/utils.js') {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            } else {
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
})

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/utils.js`);
});