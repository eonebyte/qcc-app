import React from 'react'
import { Modal, Button } from 'antd-mobile'
import { useRegisterSW } from 'virtual:pwa-register/react'

const ReloadPrompt = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered')
      // Cek update setiap 60 detik (opsional)
      r && setInterval(() => {
        r.update()
      }, 60 * 1000)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  // Jika aplikasi siap digunakan secara offline
  if (offlineReady) {
    Modal.show({
      content: 'Aplikasi siap digunakan secara offline.',
      closeOnAction: true,
      actions: [{ key: 'ok', text: 'Mengerti' }],
    })
    setOfflineReady(false)
  }

  // JIKA ADA UPDATE BARU
  if (needRefresh) {
    Modal.show({
      title: 'Update Tersedia',
      content: 'Versi baru aplikasi telah tersedia. Segarkan sekarang untuk mendapatkan fitur terbaru?',
      closeOnMaskClick: false,
      actions: [
        {
          key: 'refresh',
          text: 'Update Sekarang',
          primary: true,
          onClick: () => updateServiceWorker(true), // Ini akan memicu reload aplikasi
        },
        {
          key: 'later',
          text: 'Nanti saja',
          onClick: () => close(),
        },
      ],
    })
  }

  return null // Komponen ini tidak merender apa pun secara langsung di DOM
}

export default ReloadPrompt