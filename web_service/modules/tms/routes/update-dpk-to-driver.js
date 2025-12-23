export default async (server, opts) => {
  server.post("/update/dkp/to/driver", async (req, reply) => {
    try {
      const {
        adw_handover_group_id,
        driver_id,
        driver_name,
        tnkb_id,
        tnkb_name
      } = req.body;

      if (!adw_handover_group_id) {
        return reply.code(400).send({ success: false, message: "adw_handover_group_id is required" });
      }

      // Minimal harus ada satu data yang diupdate
      if (!driver_id && !tnkb_id) {
        return reply.code(400).send({ success: false, message: "Nothing to update" });
      }

      const result = await server.tms.updateSJDPKToDriver(
        server,
        adw_handover_group_id,
        { driver_id, driver_name, tnkb_id, tnkb_name }
      );

      return reply.send({
        success: true,
        message: "Bundle Berhasil Diperbarui",
        data: result
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ success: false, message: error.message });
    }
  });
};