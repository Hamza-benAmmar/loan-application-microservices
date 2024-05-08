const express = require("express");
const multer = require("multer");
const path = require("path");
const amqp = require("amqplib");
const { randomUUID } = require("crypto");

const app = express();
const port = 3001;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "C:/microservices_project/uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "_" + file.originalname);
  },
});

const upload_files = multer({
  storage: storage,
});

app.use(express.static("uploads"));

const connectToRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");
    const channel = await connection.createChannel();

    await channel.assertQueue("fileUploaded");
    await channel.assertQueue("NotifyUser");

    const sendToQueue = (message) => {
      channel.sendToQueue("fileUploaded", Buffer.from(JSON.stringify(message)));
      console.log(" [x] Sent %s", message);
    };
    const consumeFromQueue = async () => {
      channel.consume("NotifyUser", (message) => {
        if (message !== null) {
          const content = JSON.parse(message.content.toString());
          console.log("Received message from NotifyUser queue:", content);
          console.log("Your loan application has been ", content.result);
          channel.ack(message);
        }
      });
    };

    consumeFromQueue();

    app.post("/upload", upload_files.single("document"), (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: "No document uploaded" });
      }
      const message = {
        userId: req.body.id,
        documentPath: req.file.path,
        application: { id: randomUUID(), amount: req.body.amount },
      };
      sendToQueue(message);

      res.json(message);
    });
  } catch (error) {
    console.error("Error connecting to RabbitMQ:", error);
  }
};

connectToRabbitMQ();

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
