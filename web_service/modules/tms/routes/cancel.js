export default async (server, opts) => {
  server.post("/cancel", async (request, reply) => {
    try {
      const body = request.body;
      const result = await server.tms.processCancel(server, body);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });

  server.post("/cancel/mkt", async (request, reply) => {
    try {
      const body = request.body;
      const result = await server.tms.processCancelMkt(server, body);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });

  server.post("/req/cancel", async (request, reply) => {
    try {
      const body = request.body;
      const result = await server.tms.processReqCancel(server, body);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });

  server.post("/req/cancel/mkt", async (request, reply) => {
    try {
      const body = request.body;
      const userId = request.user.ad_user_id;
      const result = await server.tms.processReqCancelMkt(server, body, userId);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });

  server.post("/reject/req/cancel", async (request, reply) => {
    try {
      const body = request.body;
      const result = await server.tms.processRejectReqCancel(server, body);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });

  server.post("/reject/req/cancel/mkt", async (request, reply) => {
    try {
      const body = request.body;
      const result = await server.tms.processRejectReqCancelMkt(server, body);
      reply.send({
        success: true,
        message: "fetch successfully",
        data: result,
      });
    } catch (error) {
      request.log.error(error);
      reply
        .status(500)
        .send({ success: false, message: `Failed: ${error.message || error}` });
    }
  });
};
