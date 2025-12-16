import React from 'react'
import CheckOutDropOnly from './Handover/CheckOutDropOnly'
import LayoutGlobal from '../../components/layouts/LayoutGlobal'
import useIsMobile from '../../hooks/useIsMobile'
import CheckOutDropOnlyMobile from './Handover/CheckOutDropOnlyMobile'


export default function DropOnly() {
    const isMobile = useIsMobile()
    return isMobile ? <CheckOutDropOnlyMobile /> :
        <div>
            <LayoutGlobal>
                <CheckOutDropOnly />
            </LayoutGlobal>
        </div>

}
