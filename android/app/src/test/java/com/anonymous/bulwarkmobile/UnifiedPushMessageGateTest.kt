package com.anonymous.bulwarkmobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UnifiedPushMessageGateTest {
    private val p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
    private val auth = "tBHItJI5svbpez7KI4CCXg"

    @Test
    fun `a plain message is refused once keys were registered`() {
        assertFalse(UnifiedPushMessageGate.accepts(decrypted = false, p256dh = p256dh, auth = auth))
    }

    @Test
    fun `a decrypted message is accepted when keys were registered`() {
        assertTrue(UnifiedPushMessageGate.accepts(decrypted = true, p256dh = p256dh, auth = auth))
    }

    @Test
    fun `a plain message is accepted when no keys were registered`() {
        assertTrue(UnifiedPushMessageGate.accepts(decrypted = false, p256dh = null, auth = null))
        assertTrue(UnifiedPushMessageGate.accepts(decrypted = false, p256dh = "", auth = ""))
    }

    @Test
    fun `half a key set is no key set, as the relay registration requires both`() {
        assertTrue(UnifiedPushMessageGate.accepts(decrypted = false, p256dh = p256dh, auth = null))
        assertTrue(UnifiedPushMessageGate.accepts(decrypted = false, p256dh = null, auth = auth))
    }
}
