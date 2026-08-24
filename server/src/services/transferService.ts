import { prisma } from '../config/database'
import { generateNumber, toDecimal } from '../../../shared/utils'
import { sequenceService } from './sequenceService'
import { MOVEMENT_TYPES, SERIAL_STATUS } from '../../../shared/constants'
import { Prisma } from '@prisma/client'

// خدمة التحويلات: نقل المخزون بين المخازن (داخلي/بين فروع/مرتجع للمركز)
export class TransferService {
  /**
   * إنشاء تحويل مخزون مع التحقق من توفر الكميات
   * الرقم TRN يُولّد عبر SequenceService (آمن ضد التزامن)
   */
  async createTransfer(data: {
    companyId: number
    transferDate: Date
    fromWarehouseId: number
    toWarehouseId: number
    transferType?: string
    notes?: string
    createdBy?: number
    items: Array<{
      itemId: number
      quantity: number
      unitCost?: number
    }>
  }) {
    const {
      companyId,
      transferDate,
      fromWarehouseId,
      toWarehouseId,
      transferType = 'transfer',
      notes,
      createdBy,
      items,
    } = data

    if (fromWarehouseId === toWarehouseId) {
      throw new Error('لا يمكن التحويل لنفس المخزن')
    }
    if (!items || items.length === 0) {
      throw new Error('لا توجد أصناف')
    }

    const isBranchRequest = transferType === 'branch_request'

    return prisma.$transaction(async (tx) => {
      // التحقق من أن المخازن تنتمي لنفس الشركة
      const [from, to] = await Promise.all([
        tx.warehouse.findFirst({ where: { id: fromWarehouseId, companyId } }),
        tx.warehouse.findFirst({ where: { id: toWarehouseId, companyId } }),
      ])
      if (!from) throw new Error('المخزن المصدر غير موجود في هذه الشركة')
      if (!to) throw new Error('المخزن الهدف غير موجود في هذه الشركة')

      // توليد رقم التحويل
      const transferNumber = generateNumber('TRN', await sequenceService.next(companyId, 'TRN', tx))

      // في الطلب الداخلي: لا نفحص الكمية عند الإنشاء (تُفحص عند المراجعة)
      if (!isBranchRequest) {
        for (const item of items) {
          const stock = await tx.stock.findUnique({
            where: {
              itemId_warehouseId: { itemId: item.itemId, warehouseId: fromWarehouseId },
            },
          })
          if (!stock || stock.quantity.toNumber() - (stock.damagedStock?.toNumber() ?? 0) < item.quantity) {
            const itemData = await tx.item.findUnique({ where: { id: item.itemId } })
            throw new Error(`الكمية غير كافية للصنف: ${itemData?.itemName || item.itemId}`)
          }
        }
      }

      // الحالة: طلب داخلي يبدأ بـ requested، التحويل العادي يبدأ بـ pending
      const initialStatus = isBranchRequest ? 'requested' : 'pending'

      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          transferNumber,
          transferDate,
          fromWarehouseId,
          toWarehouseId,
          transferType,
          status: initialStatus,
          requestedBy: createdBy,
          notes,
          items: {
            create: items.map((item) => ({
              itemId: item.itemId,
              quantity: toDecimal(item.quantity),
              unitCost: toDecimal(item.unitCost ?? 0),
            })),
          },
        },
        include: {
          items: { include: { item: true } },
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })

      return transfer
    }, { timeout: 30000 })
  }

  /**
   * اعتماد تحويل (بعد المراجعة)
   */
  async approveTransfer(transferId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } })
      if (!transfer) throw new Error('التحويل غير موجود')
      if (transfer.status !== 'pending') throw new Error('التحويل يجب أن يكون معلقاً للاعتماد')

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
        include: {
          items: { include: { item: true } },
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })
    })
  }

  /**
   * إلغاء أو رفض تحويل
   */
  async cancelTransfer(transferId: number, userId: number, status: 'cancelled' | 'rejected' = 'cancelled') {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } })
      if (!transfer) throw new Error('التحويل غير موجود')
      if (transfer.status === 'received') throw new Error('لا يمكن إلغاء تحويل مستلم')
      if (transfer.status === 'cancelled' || transfer.status === 'rejected') {
        throw new Error('التحويل أُلغي مسبقاً')
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status, approvedBy: userId, approvedAt: new Date() },
        include: {
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })
    })
  }

  /**
   * مراجعة طلب داخلي: المصدر يعدل الكميات ويعتمد
   * يقوم بخصم المخزون من المخزن المصدر فوراً
   */
  async reviewTransfer(
    transferId: number,
    reviewedBy: number,
    reviewedItems: Array<{
      transferItemId: number
      approvedQty: number
      notes?: string
    }>,
    generalNotes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        include: { items: { include: { item: true } } },
      })
      if (!transfer) throw new Error('التحويل غير موجود')
      if (transfer.status !== 'requested') throw new Error('يمكن مراجعة الطلبات المعلقة فقط')

      for (const rItem of reviewedItems) {
        const tItem = transfer.items.find((ti) => ti.id === rItem.transferItemId)
        if (!tItem) throw new Error('بنود التحويل غير متطابقة')

        const itemId = tItem.itemId
        const unitCost = tItem.unitCost.toNumber()

        // فحص المخزون المتاح في المخزن المصدر
        const stock = await tx.stock.findUnique({
          where: { itemId_warehouseId: { itemId, warehouseId: transfer.fromWarehouseId } },
        })
        const available = stock ? stock.quantity.toNumber() - (stock.damagedStock?.toNumber() ?? 0) : 0

        if (rItem.approvedQty > available) {
          const itemName = tItem.item?.itemName || `#${itemId}`
          throw new Error(
            `الكمية المعتمدة (${rItem.approvedQty}) تتجاوز المتاح (${available}) للصنف: ${itemName}`
          )
        }

        // تحديث الكمية المعتمدة
        await tx.stockTransferItem.update({
          where: { id: rItem.transferItemId },
          data: {
            quantity: toDecimal(rItem.approvedQty),
          },
        })

        // خصم المخزون من المخزن المصدر فوراً عند الاعتماد
        if (rItem.approvedQty > 0) {
          const fromBalance = available - rItem.approvedQty

          await tx.stock.update({
            where: { id: stock!.id },
            data: { quantity: { decrement: rItem.approvedQty } },
          })

          // تسجيل حركة صادر
          await tx.stockMovement.create({
            data: {
              companyId: transfer.companyId,
              movementDate: new Date(),
              movementType: MOVEMENT_TYPES.TRANSFER_OUT,
              referenceType: 'stock_transfer',
              referenceId: transfer.id,
              itemId,
              warehouseId: transfer.fromWarehouseId,
              quantity: -rItem.approvedQty,
              unitCost,
              totalCost: unitCost * rItem.approvedQty,
              balanceAfter: fromBalance,
              notes: `مراجعة طلب ${transfer.transferNumber}`,
              createdBy: reviewedBy,
            },
          })
        }
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: 'in_transit',
          approvedBy: reviewedBy,
          approvedAt: new Date(),
          notes: generalNotes || transfer.notes,
        },
        include: {
          items: { include: { item: true } },
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })
    }, { timeout: 30000 })
  }

  /**
   * استلام تحويل: تنفيذ حركات المخزون (نقل فعلي بين المخازن)
   * لا يعدّل متوسط التكلفة (تحويل داخلي لا يُدخل قيمة جديدة)
   * يدعم الاستلام الجزئي عبر receivedQty + نقل الأرقام التسلسلية
   */
  async receiveTransfer(
    transferId: number,
    data: {
      companyId: number
      receivedBy: number
      receivedAt?: Date
      items?: Array<{
        transferItemId: number
        receivedQty: number
        serialNumbers?: string[]
      }>
    }
  ) {
    const { companyId, receivedBy, receivedAt = new Date(), items: receivedItems = [] } = data

    return prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        include: {
          items: { include: { item: true } },
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })
      if (!transfer) throw new Error('التحويل غير موجود')
      if (transfer.companyId !== companyId) throw new Error('التحويل غير موجود في هذه الشركة')
      if (transfer.status === 'received') throw new Error('التحويل مستلم مسبقاً')
      if (transfer.status === 'cancelled' || transfer.status === 'rejected') {
        throw new Error('التحويل ملغي ولا يمكن استلامه')
      }

      const allReceived: boolean[] = []

      for (const tItem of transfer.items) {
        const itemId = tItem.itemId
        const totalQty = tItem.quantity.toNumber()
        const alreadyReceived = tItem.receivedQty?.toNumber() || 0
        const remaining = totalQty - alreadyReceived
        if (remaining <= 0) {
          allReceived.push(true)
          continue
        }

        // الكمية المستلمة (كاملة أو جزئية حسب الإدخال)
        const reqItem = receivedItems.find((ri) => ri.transferItemId === tItem.id)
        const receiveQty = reqItem ? Math.min(reqItem.receivedQty, remaining) : remaining
        if (receiveQty <= 0) {
          allReceived.push(false)
          continue
        }

        const unitCost = tItem.unitCost.toNumber()
        const isBranchRequest = transfer.transferType === 'branch_request'

        // خصم من المخزن المصدر (فقط للتحويلات العادية — في الطلب الداخلي خُصم عند المراجعة)
        let fromBalance = 0
        if (!isBranchRequest) {
          const fromStock = await tx.stock.findUnique({
            where: {
              itemId_warehouseId: { itemId, warehouseId: transfer.fromWarehouseId },
            },
          })
          if (!fromStock || fromStock.quantity.toNumber() < receiveQty) {
            throw new Error(`الكمية غير كافية في المخزن المصدر للصنف: ${tItem.item.itemName}`)
          }
          await tx.stock.update({
            where: { id: fromStock.id },
            data: { quantity: { decrement: receiveQty } },
          })
          fromBalance = fromStock.quantity.toNumber() - receiveQty

          // تسجيل حركة صادر
          await tx.stockMovement.create({
            data: {
              companyId,
              movementDate: receivedAt,
              movementType: MOVEMENT_TYPES.TRANSFER_OUT,
              referenceType: 'stock_transfer',
              referenceId: transfer.id,
              itemId,
              warehouseId: transfer.fromWarehouseId,
              quantity: -receiveQty,
              unitCost: unitCost,
              totalCost: unitCost != null ? -(unitCost * receiveQty) : null,
              balanceAfter: fromBalance,
              notes: transfer.transferNumber,
              createdBy: receivedBy,
            },
          })
        } else {
          // الطلب الداخلي: حركة الصادر سجلت عند المراجعة — نحسب الرصيد الحالي فقط
          const fromStock = await tx.stock.findUnique({
            where: {
              itemId_warehouseId: { itemId, warehouseId: transfer.fromWarehouseId },
            },
          })
          fromBalance = fromStock?.quantity.toNumber() ?? 0
        }

        // إضافة إلى المخزن الهدف
        let toStock = await tx.stock.findUnique({
          where: { itemId_warehouseId: { itemId, warehouseId: transfer.toWarehouseId } },
        })
        if (!toStock) {
          toStock = await tx.stock.create({
            data: {
              companyId,
              itemId,
              warehouseId: transfer.toWarehouseId,
              quantity: 0,
            },
          })
        }
        await tx.stock.update({
          where: { id: toStock.id },
          data: { quantity: { increment: receiveQty } },
        })

        // تسجيل حركة وارد (دائماً — سواء تحويل عادي أو طلب داخلي)
        const toBalance = toStock.quantity.toNumber() + receiveQty

        await tx.stockMovement.create({
          data: {
            companyId,
            movementDate: receivedAt,
            movementType: MOVEMENT_TYPES.TRANSFER_IN,
            referenceType: 'stock_transfer',
            referenceId: transfer.id,
            itemId,
            warehouseId: transfer.toWarehouseId,
            quantity: receiveQty,
            unitCost: unitCost,
            totalCost: unitCost != null ? unitCost * receiveQty : null,
            balanceAfter: toBalance,
            notes: transfer.transferNumber,
            createdBy: receivedBy,
          },
        })

        // الأرقام التسلسلية: نقل بين المخازن
        const serialNumbers = reqItem?.serialNumbers || []
        if (serialNumbers.length > 0) {
          for (const sn of serialNumbers) {
            const serial = await tx.serial.findUnique({ where: { serialNumber: sn } })
            if (!serial || serial.itemId !== itemId) {
              throw new Error(`الرقم التسلسلي غير صالح للصنف: ${sn}`)
            }
            if (serial.warehouseId !== transfer.fromWarehouseId || serial.status !== SERIAL_STATUS.IN_STOCK) {
              throw new Error(`الرقم التسلسلي غير متوفر في المخزن المصدر: ${sn}`)
            }
            await tx.serial.update({
              where: { id: serial.id },
              data: { warehouseId: transfer.toWarehouseId },
            })
            await tx.serialMovement.create({
              data: {
                serialId: serial.id,
                fromWarehouseId: transfer.fromWarehouseId,
                toWarehouseId: transfer.toWarehouseId,
                fromStatus: serial.status,
                toStatus: serial.status,
                referenceType: 'stock_transfer',
                referenceId: transfer.id,
                createdBy: receivedBy,
              },
            })
          }
        }

        // تحديث الكمية المستلمة في سطر التحويل
        await tx.stockTransferItem.update({
          where: { id: tItem.id },
          data: { receivedQty: alreadyReceived + receiveQty },
        })

        allReceived.push(alreadyReceived + receiveQty >= totalQty)
      }

      const isComplete = allReceived.every(Boolean)

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: isComplete ? 'received' : 'in_transit',
          receivedBy,
          receivedAt,
        },
        include: {
          items: { include: { item: true } },
          fromWarehouse: { include: { branch: true } },
          toWarehouse: { include: { branch: true } },
        },
      })
    }, { timeout: 30000 })
  }
}

export const transferService = new TransferService()
