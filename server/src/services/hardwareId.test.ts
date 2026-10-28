import { generateHardwareHash, listCandidateMacs, selectStableMac } from './hardwareId'

// =====================================================================
// بصمة العتاد — يجب أن تكون **مستقرة** عبر إعادة ترتيب كروت الشبكة
// العطل الحقيقي (2026-10-28): كانت البصمة تختار "أول MAC غير داخلي" بترتيب
// os.networkInterfaces()، وهو ترتيب يتغيّر عند ظهور/اختفاء كروت افتراضية
// (WSL / Hyper-V / Tailscale / VPN / Bluetooth) → HARDWARE_MISMATCH → 403
// على كل المسارات المصادَقة رغم أن الترخيص سليم.
// =====================================================================

type Ifaces = Record<string, Array<{ mac: string; internal: boolean }>>

const wifi = { mac: 'AA:BB:CC:00:00:02', internal: false }
const ethernet = { mac: 'AA:BB:CC:00:00:01', internal: false }
const wsl = { mac: '00:15:5D:11:22:33', internal: false }
const tailscale = { mac: 'AA:BB:CC:99:99:99', internal: false }
const vpn = { mac: '00:FF:11:22:33:44', internal: false }
const bluetooth = { mac: '00:1A:7D:DA:71:13', internal: false }
const loopback = { mac: '00:00:00:00:00:00', internal: true }

describe('hardwareId — اختيار MAC مستقر', () => {
  it('يعيد نفس النتيجة مهما تغيّر ترتيب الكروت', () => {
    const a: Ifaces = { 'Wi-Fi': [wifi], Ethernet: [ethernet] }
    const b: Ifaces = { Ethernet: [ethernet], 'Wi-Fi': [wifi] }

    expect(selectStableMac(a)).toBe(selectStableMac(b))
    expect(selectStableMac(a)).toBe('aa:bb:cc:00:00:01')
  })

  it('يتجاهل الكروت الافتراضية: WSL/Hyper-V و Tailscale و VPN و Bluetooth', () => {
    const ifaces: Ifaces = {
      'vEthernet (WSL)': [wsl],
      Tailscale: [tailscale],
      'TAP-Windows Adapter V9': [vpn],
      'Bluetooth Network Connection': [bluetooth],
      Loopback: [loopback],
      'Wi-Fi': [wifi],
    }

    expect(listCandidateMacs(ifaces)).toEqual(['aa:bb:cc:00:00:02'])
    expect(selectStableMac(ifaces)).toBe('aa:bb:cc:00:00:02')
  })

  it('ظهور كرت Tailscale أو VPN لا يغيّر البصمة', () => {
    const before: Ifaces = { 'Wi-Fi': [wifi] }
    const after: Ifaces = { 'Wi-Fi': [wifi], Tailscale: [tailscale], 'WireGuard Tunnel': [vpn] }

    expect(selectStableMac(before)).toBe(selectStableMac(after))
  })

  it('يرفض عناوين MAC الصفرية والكروت الداخلية', () => {
    const ifaces: Ifaces = {
      Loopback: [loopback],
      'vEthernet (Default Switch)': [wsl],
    }

    expect(selectStableMac(ifaces)).toBeNull()
  })

  it('يزيل التكرار ويوحّد حالة الأحرف', () => {
    const ifaces: Ifaces = {
      'Wi-Fi': [{ mac: 'AA:BB:CC:00:00:02', internal: false }],
      Ethernet: [{ mac: 'aa:bb:cc:00:00:02', internal: false }],
    }

    expect(listCandidateMacs(ifaces)).toEqual(['aa:bb:cc:00:00:02'])
  })

  it('يعيد null عند غياب أي كرت حقيقي', () => {
    expect(selectStableMac({})).toBeNull()
    expect(selectStableMac({ Loopback: [loopback] })).toBeNull()
  })
})

describe('hardwareId — بصمة الترخيص', () => {
  it('بصمة ثابتة على نفس الجهاز (hex بطول 64)', () => {
    const a = generateHardwareHash()
    const b = generateHardwareHash()

    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
})
