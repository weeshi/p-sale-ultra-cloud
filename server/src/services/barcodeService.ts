import { prisma } from '../config/database'
import QRCode from 'qrcode'
import { generateBarcode } from '../../../shared/utils'

// خدمة الباركود والكيو آر: توليد وقراءة
export class BarcodeService {
  /**
   * توليد باركود لصنف لا يملك باركود
   */
  async generateBarcode(itemId: number, companyId: number) {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    })
    if (!item) throw new Error('الصنف غير موجود')
    if (item.companyId !== companyId) throw new Error('لا تملك صلاحية لهذا الصنف')

    if (item.barcode) {
      return { barcode: item.barcode, item }
    }

    const barcode = generateBarcode(item.itemCode, item.id)

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: { barcode },
    })

    return { barcode, item: updated }
  }

  /**
   * توليد QR Code لصنف
   */
  async generateQRCode(itemId: number, companyId: number) {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    })
    if (!item || item.companyId !== companyId) throw new Error('الصنف غير موجود')

    const qrData = JSON.stringify({
      type: 'item',
      id: item.id,
      code: item.itemCode,
      name: item.itemName,
      barcode: item.barcode,
    })

    const qrImage = await QRCode.toDataURL(qrData, { width: 300 })
    return { qrCode: qrImage, item }
  }

  /**
   * البحث عن صنف بواسطة الباركود
   */
  async findByBarcode(barcode: string, companyId: number) {
    if (!barcode) return null

    const item = await prisma.item.findFirst({
      where: {
        OR: [
          { barcode: barcode },
          { itemCode: barcode },
        ],
      },
      include: {
        category: true,
        brand: true,
        unit: true,
        attributes: { include: { attribute: true } },
        stock: true,
      },
    })

    // التحقق من الشركة
    if (item && item.companyId !== companyId) return null

    return item
  }

  /**
   * البحث عن رقم تسلسلي
   */
  async findBySerial(serialNumber: string, companyId: number) {
    const serial = await prisma.serial.findFirst({
      where: { serialNumber, companyId },
      include: { item: true, warehouse: true },
    })
    return serial
  }
}

export const barcodeService = new BarcodeService()
