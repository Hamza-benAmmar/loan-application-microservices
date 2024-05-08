const amqp = require("amqplib");
const express = require("express");
const app = express();
const port = 3005;

const connectToRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");
    const channel = await connection.createChannel();
    await channel.assertQueue("RiskAssessment");
    await channel.assertQueue("NotifyUser");

    console.log("Notification Service connected to RabbitMQ");

    const consumeFromQueue = async () => {
      channel.consume("RiskAssessment", async (message) => {
        if (message !== null) {
          const content = JSON.parse(message.content.toString());
          console.log("Received notification:", content);
          channel.sendToQueue(
            "NotifyUser",
            Buffer.from(JSON.stringify(content))
          );

          channel.ack(message);
        }
      });
    };

    consumeFromQueue();
  } catch (error) {
    console.error("Error connecting to RabbitMQ:", error);
  }
};

connectToRabbitMQ();
app.listen(port, () => {
  console.log(`Notification Service is running on http://localhost:${port}`);
});
