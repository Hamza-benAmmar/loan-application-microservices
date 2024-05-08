const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const axios = require("axios");
const port = 3002;
const amqp = require("amqplib");
function countWords(str) {
  str = str.trim();
  if (str === "") {
    return 0;
  }
  const words = str.split(/\s+/);
  return words.length;
}
const sendToOCRService = async (filePath) => {
  try {
    const base_url = "C:/microservices_project/";
    const fileContent = fs.readFileSync(filePath);
    const response = await axios.post(
      "http://localhost:3003/process",
      {
        filePath: filePath,
      },
      {
        "Content-Type": "multipart/form-data",
        env: {
          PATH: `${process.env.PATH};C:\\Program Files\\Tesseract-OCR`,
        },
      }
    );
    console.log("OCR Service Response:", response.data.text);
    return response.data.text;
  } catch (error) {
    console.error("Error sending request to OCR service:", error);
  }
};

const connectToRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");
    const channel = await connection.createChannel();

    await channel.assertQueue("fileUploaded");
    await channel.assertQueue("CommercialProcessing");

    const consumeFromQueue = async () => {
      await channel.consume("fileUploaded", async (message) => {
        if (message !== null) {
          const content = JSON.parse(message.content.toString());
          console.log("Received message:", content);
          const ocrResult = await sendToOCRService(content.documentPath);

          const dbFilePath = path.join("C:/microservices_project", "db.json");
          let dbData = {};
          try {
            const data = fs.readFileSync(dbFilePath);
            dbData = JSON.parse(data);
          } catch (err) {
            console.error("Error reading db.json:", err);
          }
          const user = dbData.users.find((user) => user.id === content.userId);
          if (user) {
            user.loan_applications.push({
              ...content.application,
              score1: countWords(ocrResult),
            });
            fs.writeFileSync(dbFilePath, JSON.stringify(dbData));
            console.log(
              "Updated loan applications for user with ID",
              content.userId
            );
            console.log("Calculated score 1 : " + countWords(ocrResult));
            console.log(
              "check the eligibility of the borrower and the repayment terms and period"
            );
          } else {
            console.log("User with ID", content.userId, "not found in db.json");
          }
          try {
            fs.writeFileSync(dbFilePath, JSON.stringify(dbData));
            console.log("Application appended to", dbFilePath);
          } catch (err) {
            console.error("Error appending application to db.json:", err);
          }

          channel.ack(message);

          const sendToQueue = (message) => {
            channel.sendToQueue(
              "CommercialProcessing",
              Buffer.from(JSON.stringify(message))
            );
            console.log(" [x] Sent %s", message);
          };

          // Inform risk-management service
          sendToQueue(content);
        }
      });
    };

    await consumeFromQueue();
  } catch (error) {
    console.error("Error connecting to RabbitMQ:", error);
  }
};

connectToRabbitMQ();
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
