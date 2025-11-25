import useIsMobile from '../../hooks/useIsMobile';
import ReceiptDesktop2 from './ReceiptDesktop2';
import ReceiptMobile from './ReceiptMobile';

const Receipt = () => {
    const isMobile = useIsMobile();

    // Jika terdeteksi mobile, tampilkan versi mobile. Jika tidak, tampilkan versi desktop.
    return isMobile ? <ReceiptMobile /> : <ReceiptDesktop2 />;
};
export default Receipt;