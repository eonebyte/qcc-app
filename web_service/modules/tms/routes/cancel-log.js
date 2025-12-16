export default async (server, opts) => {
  server.get("/cancel-log", async (request, reply) => {
    try {
      const { adw_trackingsj_id } = request.query;
      const cancelLogs = await server.tms.getCancelLogs(
        server,
        adw_trackingsj_id,
      );
      reply.send({
        success: true,
        count: cancelLogs.length,
        message: "fetch successfully",
        data: cancelLogs,
      });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ message: `Failed: ${error.message || error}` });
    }
  });
};
