const amqp = require("amqplib");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const express = require("express");
const app = express();
const port = 3004;

const sendToOCRService = async (filePath) => {
  try {
    const response = await axios.post(
      "http://localhost:3003/process",
      {
        filePath,
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
    await channel.assertQueue("CommercialProcessing");
    await channel.assertQueue("RiskAssessment");

    console.log("Risk Management Service connected to RabbitMQ");

    const sendToQueue = (message) => {
      channel.sendToQueue(
        "RiskAssessment",
        Buffer.from(JSON.stringify(message))
      );
      console.log(" [x] Sent to RiskAssessment queue:", message);
    };

    const consumeFromQueue = async () => {
      channel.consume("CommercialProcessing", async (message) => {
        if (message !== null) {
          const content = JSON.parse(message.content.toString());
          const ocrResult = await sendToOCRService(content.documentPath);
          console.log("Received filepath:", content);

          const dbFilePath = path.join("C:/microservices_project", "db.json");
          let dbData = {};
          try {
            const data = fs.readFileSync(dbFilePath);
            dbData = JSON.parse(data);
          } catch (err) {
            console.error("Error reading db.json:", err);
          }
          console.log(dbData);
          const user = dbData.users.find((user) => user.id === content.userId);

          if (user) {
            const applicationIndex = user.loan_applications.findIndex(
              (app) => app.id === content.application.id
            );

            if (applicationIndex !== -1) {
              const application = user.loan_applications[applicationIndex];

              const score2 = Math.floor(Math.random() * 11);
              const final_score =
                ((score2 + application.score1) * 100) / application.amount;

              // Update the existing application object
              user.loan_applications[applicationIndex] = {
                ...application,
                score2,
                final_score,
                result: final_score > 1 ? "Approved" : "Declined",
              };

              // Send the result to the Risk Assessment queue
              sendToQueue({
                result: final_score > 1 ? "Approved" : "Declined",
              });

              fs.writeFileSync(dbFilePath, JSON.stringify(dbData));
              console.log(
                "Updated loan applications for user with ID",
                content.userId
              );
              console.log(
                "Calculated Score 2 and the final score and saved to the database"
              );
              console.log(
                "make sure that the suggested debt ratio is sufficient enough to maintain a healthy bank account balance for the borrower and that the loan can still be repaid in full as scheduled"
              );
            } else {
              console.log(
                "Loan application not found for user with ID",
                content.userId
              );
            }
          } else {
            console.log("User with ID", content.userId, "not found in db.json");
          }
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
  console.log(`OCR Service is running on http://localhost:${port}`);
});
