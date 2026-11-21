package com.anonymous.bulwarkmobile

// Decides whether a UnifiedPush message may be handled.
//
// The UnifiedPush endpoint is a public URL: anyone who learns the topic can
// publish to it. When the connector handed out RFC 8291 keys, the app
// registered them with the relay, and the relay then only sends encrypted Web
// Push. The connector still delivers a message it failed to decrypt, flagged
// `decrypted = false` (connector 3.3.5, MessagingReceiver: "Could not decrypt
// message, trying with plain text"). Such a message cannot come from the relay,
// so it is dropped: otherwise a forged plain JSON payload shows a "New email"
// notification with attacker-chosen text and forces a JMAP sync per message.
//
// Without saved keys (a legacy distributor), the relay sends plain JSON and
// the message is kept, as before.
object UnifiedPushMessageGate {
    fun accepts(decrypted: Boolean, p256dh: String?, auth: String?): Boolean =
        decrypted || !hasKeys(p256dh, auth)

    fun hasKeys(p256dh: String?, auth: String?): Boolean =
        !p256dh.isNullOrEmpty() && !auth.isNullOrEmpty()
}
