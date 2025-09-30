import useIsMobile from '../../hooks/useIsMobile';
import ReceiptDesktop from './ReceiptDesktop';
import ReceiptMobile from './ReceiptMobile';

const Receipt = () => {
    const isMobile = useIsMobile();

    // Jika terdeteksi mobile, tampilkan versi mobile. Jika tidak, tampilkan versi desktop.
    return isMobile ? <ReceiptMobile /> : <ReceiptDesktop />;
};
export default Receipt;