import crypto from 'crypto'
import os from 'os'

// =====================================================================
// بصمة العتاد (Hardware Fingerprint) — مستقرة وحتمية
// ---------------------------------------------------------------------
// البصمة = CPU + عدد الأنوية + MAC واحد مختار **حتمياً**.
//
// لماذا لا نأخذ "أول MAC غير داخلي" كما كان سابقاً؟
// ترتيب `os.networkInterfaces()` ليس ثابتاً: ظهور أو اختفاء كرت افتراضي
// (WSL/Hyper-V/Tailscale/VPN/Bluetooth) يغيّر الترتيب، فيتغيّر MAC المختار
// ⇒ HARDWARE_MISMATCH ⇒ 403 «License validation failed» على كل المسارات
// المصادَقة رغم سلامة الترخيص (عطل موثّق 2026-10-28).
//
// الحل: استبعاد الكروت الافتراضية/المؤقتة، ثم **ترتيب** الباقي واختيار
// الأول — فالنتيجة لا تعتمد على ترتيب الواجهات إطلاقاً.
// =====================================================================

export interface NetworkInterfaceLike {
  mac: string
  internal: boolean
}

/** أسماء كروت لا تصلح للبصمة: افتراضية، مؤقتة، أو تُضاف/تُحذف بحرية */
const VIRTUAL_ADAPTER_PATTERNS: RegExp[] = [
  /vethernet/i,        // Hyper-V / WSL
  /hyper-?v/i,
  /wsl/i,
  /virtualbox/i,
  /vmware/i,
  /docker/i,
  /^veth/i,
  /^br-/i,
  /^tap/i,             // TAP-Windows (OpenVPN)
  /^tun/i,
  /wintun/i,
  /wireguard/i,
  /tailscale/i,
  /zerotier/i,
  /vpn/i,
  /npcap/i,
  /hamachi/i,
  /radmin/i,
  /bluetooth/i,
  /loopback/i,
  /teredo/i,
  /isatap/i,
  /pseudo-?interface/i,
]

const NULL_MAC = '00:00:00:00:00:00'

function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * كل عناوين MAC الصالحة للبصمة، منظّفة ومرتّبة تصاعدياً.
 * الترتيب يجعل النتيجة حتمية بغض النظر عن ترتيب الواجهات.
 */
export function listCandidateMacs(
  interfaces: Record<string, NetworkInterfaceLike[] | undefined>
): string[] {
  const macs = new Set<string>()

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || isVirtualAdapter(name)) continue
    for (const entry of entries) {
      if (!entry || entry.internal) continue
      const mac = String(entry.mac ?? '').toLowerCase()
      if (!mac || mac === NULL_MAC) continue
      macs.add(mac)
    }
  }

  return [...macs].sort()
}

/** أول MAC حقيقي بترتيب حتمي — أو null إن لم يوجد أي كرت فعلي */
export function selectStableMac(
  interfaces: Record<string, NetworkInterfaceLike[] | undefined>
): string | null {
  const candidates = listCandidateMacs(interfaces)
  return candidates.length > 0 ? candidates[0] : null
}

/**
 * بصمة العتاد النهائية: SHA-256 لـ «طراز المعالج:عدد الأنوية:MAC المستقر».
 * تُستخدم في ربط الترخيص بالجهاز (licenseService) وفي `/api/license/machine-id`.
 */
export function generateHardwareHash(): string {
  const cpus = os.cpus()
  const cpuModel = cpus[0]?.model || 'unknown'
  const cpuCount = cpus.length
  const mac = selectStableMac(os.networkInterfaces() as Record<string, NetworkInterfaceLike[] | undefined>) || 'no-mac'

  return crypto.createHash('sha256').update(`${cpuModel}:${cpuCount}:${mac}`).digest('hex')
}
