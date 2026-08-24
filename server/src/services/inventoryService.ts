import { prisma } from '../config/database'
import { MOVEMENT_TYPES, SERIAL_STATUS } from '../../../shared/constants'
import { generateNumber, absorbedAverageCost } from '../../../shared/utils'
import { sequenceService } from './sequenceService'
import { Prisma } from '@prisma/client'

// خدمة المخزون: تحديث الأرصدة، الأرقام التسلسلية، متوسط التكلفة
export class InventoryService {
  /**
   * تسجيل حركة مخزون وتحديث الرصيد ومتوسط التكلفة
   * يقبل tx اختياري للانضمام إلى ترانزاكشن خارجي (يمنع التداخل/الحصار)
   */
  async recordMovement(
    data: {
      companyId: number
      movementDate: Date
      movementType: string
      referenceType?: string
      referenceId?: number
      itemId: number
      warehouseId?: number
      quantity: number
      unitCost?: number
      notes?: string
      createdBy?: number
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { companyId, movementType, itemId, warehouseId, quantity, unitCost, ...rest } = data

    const run = async (tx: Prisma.TransactionClient) => {
      let stock = warehouseId
        ? await tx.stock.findUnique({
            where: { itemId_warehouseId: { itemId, warehouseId } },
          })
        : null

      let balanceAfter: number | null = null

      if (warehouseId) {
        if (!stock) {
          stock = await tx.stock.create({
            data: {
              companyId,
              itemId,
              warehouseId,
              quantity: 0,
            },
          })
        }

        if (
          movementType === MOVEMENT_TYPES.DAMAGED ||
          movementType === MOVEMENT_TYPES.RETURN_DAMAGED
        ) {
          // تحويل كميات صالحة إلى تالفة: تُرفع damagedStock دون تغيير الإجمالي
          const validQty = stock.quantity.toNumber() - stock.damagedStock.toNumber()
          // فحص الصالح يطبق على تسجيل التالف فقط؛ المرتجع كتالف يعيد أصنافاً بيعت أصلاً
          if (movementType === MOVEMENT_TYPES.DAMAGED && quantity > validQty) {
            throw new Error('الكمية التالفة تتجاوز الكمية الصالحة في المخزن')
          }
          balanceAfter = validQty - quantity

          await tx.stock.update({
            where: { id: stock.id },
            data: { damagedStock: { increment: quantity } },
          })

          // امتصاص التكلفة فوراً: قيمة المخزون الحالي تُوزَّع على الكمية الصالحة فقط
          const item = await tx.item.findUnique({ where: { id: itemId } })
          if (item) {
            const total = item.currentStock.toNumber()
            const newDamaged = item.damagedStock.toNumber() + quantity
            const newValid = total - newDamaged
            const newCost = newValid > 0 ? (total * item.costPrice.toNumber()) / newValid : 0
            await tx.item.update({
              where: { id: itemId },
              data: { damagedStock: newDamaged, costPrice: newCost },
            })
          }
        } else {
          const newQty = stock.quantity.toNumber() + quantity
          balanceAfter = newQty

          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: newQty },
          })

          // تحديث متوسط التكلفة عند إضافة كمية (شراء/تحويل وارد) — بطريقة الامتصاص: قيمة المخزون (مع التالف) تُوزّع على الصالح فقط
          if (unitCost && quantity > 0) {
            const item = await tx.item.findUnique({ where: { id: itemId } })
            if (item) {
              const currentQty = item.currentStock.toNumber()
              const damagedQty = item.damagedStock.toNumber()
              const newAvg = absorbedAverageCost(
                currentQty,
                damagedQty,
                item.costPrice.toNumber(),
                quantity,
                unitCost
              )
              await tx.item.update({
                where: { id: itemId },
                data: { costPrice: newAvg },
              })
            }
          }

          await tx.item.update({
            where: { id: itemId },
            data: {
              currentStock: {
                increment: quantity,
              },
            },
          })
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          movementType,
          itemId,
          warehouseId,
          quantity,
          unitCost: unitCost ?? null,
          totalCost: unitCost != null ? unitCost * quantity : null,
          balanceAfter,
          ...rest,
        },
      })

      return movement
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * تسجيل كمية كتالفة: تحويل وحدات صالحة إلى تالفة دون تغيير الإجمالي
   * تقبل tx اختياري للانضمام إلى ترانزاكشن خارجي
   */
  async registerDamaged(
    data: {
      companyId: number
      itemId: number
      warehouseId: number
      quantity: number
      notes?: string
      createdBy?: number
      movementType?: string
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { companyId, itemId, warehouseId, quantity, notes, createdBy } = data
    if (!warehouseId) throw new Error('المخزن مطلوب')
    if (!quantity || quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    const movementType = data.movementType ?? MOVEMENT_TYPES.DAMAGED

    const run = async (tx: Prisma.TransactionClient) => {
      const stock = await tx.stock.findUnique({
        where: { itemId_warehouseId: { itemId, warehouseId } },
        include: { item: true },
      })
      if (!stock) throw new Error('لا يوجد رصيد لهذا الصنف في المخزن المحدد')

      // فحص الصالح يطبق على تسجيل التالف فقط؛ المرتجع كتالف يعيد أصنافاً بيعت أصلاً
      if (movementType === MOVEMENT_TYPES.DAMAGED) {
        const validQty = stock.quantity.toNumber() - stock.damagedStock.toNumber()
        if (quantity > validQty) {
          throw new Error(`الكمية التالفة (${quantity}) تتجاوز الكمية الصالحة (${validQty}) في المخزن`)
        }
      }

      const unitCost = stock.item.costPrice.toNumber()

      const movement = await this.recordMovement({
        companyId,
        movementDate: new Date(),
        movementType,
        itemId,
        warehouseId,
        quantity,
        unitCost,
        notes: notes ?? 'تالف',
        createdBy,
      }, tx)

      const validAfter = stock.quantity.toNumber() - (stock.damagedStock.toNumber() + quantity)
      return { movement, validQtyAfter: validAfter, unitCost }
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * عكس التالف: نقل وحدات من التالف إلى الصالح + إعادة حساب التكلفة + حركة damage_reversal
   * يقبل tx اختياري للانضمام إلى ترانزاكشن خارجي
   */
  async reverseDamaged(
    data: {
      companyId: number
      itemId: number
      warehouseId: number
      quantity: number
      notes?: string
      createdBy?: number
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { companyId, itemId, warehouseId, quantity, notes, createdBy } = data
    if (!warehouseId) throw new Error('المخزن مطلوب')
    if (!quantity || quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')

    const run = async (tx: Prisma.TransactionClient) => {
      const stock = await tx.stock.findUnique({
        where: { itemId_warehouseId: { itemId, warehouseId } },
        include: { item: true },
      })
      if (!stock) throw new Error('لا يوجد رصيد لهذا الصنف في المخزن المحدد')

      const damagedQty = stock.damagedStock.toNumber()
      if (quantity > damagedQty) {
        throw new Error(`الكمية (${quantity}) تتجاوز التالف المتاح (${damagedQty}) في المخزن`)
      }

      const unitCost = stock.item.costPrice.toNumber()

      // نقل من التالف إلى الصالح: الإجمالي لا يتغير، الصالح يزيد
      await tx.stock.update({
        where: { id: stock.id },
        data: { damagedStock: { decrement: quantity } },
      })

      const total = stock.item.currentStock.toNumber()
      const newDamaged = damagedQty - quantity
      const newValid = total - newDamaged
      // إعادة حساب التكلفة: قيمة المخزون تُوزَّع على الصالح الأكبر بعد عكس التالف
      const newCost = newValid > 0 ? (total * unitCost) / newValid : 0

      await tx.item.update({
        where: { id: itemId },
        data: { damagedStock: newDamaged, costPrice: newCost },
      })

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          movementDate: new Date(),
          movementType: MOVEMENT_TYPES.DAMAGE_REVERSAL,
          itemId,
          warehouseId,
          quantity,
          unitCost,
          totalCost: unitCost * quantity,
          balanceAfter: newValid,
          notes: notes ?? 'عكس تالف',
          createdBy,
        },
      })

      return { movement, validQtyAfter: newValid, unitCost }
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * تسجيل الأرقام التسلسلية عند الشراء
   * يقبل tx اختياري للانضمام إلى ترانزاكشن خارجي
   */
  async registerSerials(
    data: {
      companyId: number
      itemId: number
      warehouseId: number
      serialNumbers: string[]
      costPrice?: number
      purchaseItemId?: number
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { companyId, itemId, warehouseId, serialNumbers, costPrice, purchaseItemId } = data

    const run = async (tx: Prisma.TransactionClient) => {
      const created = []
      for (const serialNumber of serialNumbers) {
        const existing = await tx.serial.findUnique({ where: { serialNumber } })
        if (existing) continue

        const serial = await tx.serial.create({
          data: {
            companyId,
            itemId,
            warehouseId,
            serialNumber,
            status: SERIAL_STATUS.IN_STOCK,
            costPrice: costPrice ?? 0,
            purchaseItemId,
          },
        })
        created.push(serial)
      }
      return created
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * تحديث حالة أرقام تسلسلية موجودة (بيع/مرتجع/تحويل)
   * Shared Helper — يقلل تكرار منطق البحث والتحديث في خدمات البيع والشراء
   */
  async updateSerialsStatus(
    data: {
      serialNumbers: string[]
      status: string
      fromStatus?: string
      soldAt?: Date | null
      saleItemId?: number | null
      warehouseId?: number | null
    },
    txClient?: Prisma.TransactionClient
  ) {
    const { serialNumbers, status, fromStatus, soldAt, saleItemId, warehouseId } = data

    const run = async (tx: Prisma.TransactionClient) => {
      const updated = []
      for (const sn of serialNumbers) {
        const serial = await tx.serial.findUnique({ where: { serialNumber: sn } })
        if (!serial) continue
        if (fromStatus && serial.status !== fromStatus) continue

        const result = await tx.serial.update({
          where: { id: serial.id },
          data: {
            status,
            soldAt: soldAt === undefined ? serial.soldAt : soldAt,
            saleItemId: saleItemId === undefined ? serial.saleItemId : saleItemId,
            warehouseId: warehouseId === undefined ? serial.warehouseId : warehouseId,
          },
        })
        updated.push(result)
      }
      return updated
    }

    if (txClient) return run(txClient)
    return prisma.$transaction((tx) => run(tx), { timeout: 30000 })
  }

  /**
   * بيع برقم تسلسلي: تحديث الحالة والموقع
   */
  async sellSerial(serialId: number, saleItemId: number, warehouseId?: number) {
    return prisma.serial.update({
      where: { id: serialId },
      data: {
        status: SERIAL_STATUS.SOLD,
        soldAt: new Date(),
        saleItemId,
        warehouseId: warehouseId ?? undefined,
      },
    })
  }

  /**
   * إرجاع برقم تسلسلي (مرتجع)
   */
  async returnSerial(serialId: number, warehouseId?: number) {
    return prisma.serial.update({
      where: { id: serialId },
      data: {
        status: SERIAL_STATUS.RETURNED,
        warehouseId: warehouseId ?? undefined,
        saleItemId: null,
      },
    })
  }

  /**
   * نقل رقم تسلسلي بين المخازن
   */
  async transferSerial(serialId: number, fromWarehouseId: number, toWarehouseId: number, userId?: number) {
    return prisma.$transaction(async (tx) => {
      const serial = await tx.serial.findUnique({ where: { id: serialId } })
      if (!serial) throw new Error('الرقم التسلسلي غير موجود')

      const updated = await tx.serial.update({
        where: { id: serialId },
        data: { warehouseId: toWarehouseId },
      })

      await tx.serialMovement.create({
        data: {
          serialId,
          fromWarehouseId,
          toWarehouseId,
          fromStatus: serial.status,
          toStatus: updated.status,
          createdBy: userId,
        },
      })

      return updated
    })
  }

  /**
   * حذف جرد: draft فقط + حذف البنود ثم الجرد
   */
  async deleteCount(companyId: number, countId: number) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findFirst({ where: { id: countId, companyId } })
      if (!count) throw new Error('الجرد غير موجود')
      if (count.status === 'posted') throw new Error('لا يمكن حذف جرد تم ترحيله — استخدم جرداً تصحيحياً')
      if (count.status === 'reconciled') throw new Error('لا يمكن حذف جرد مُسوَّى')

      await tx.inventoryCountItem.deleteMany({ where: { countId } })
      await tx.inventoryCount.delete({ where: { id: countId } })

      return { success: true, message: 'حُذف الجرد بنجاح' }
    })
  }

  /**
   * إنشاء جرد جديد: رقم CNT عبر SequenceService + بذر جميع الأصناف النشطة
   * الأصناف التي لها stock في المخزن تظهر بالكمية الفعلية، والباقي بـ systemQty = 0
   */
  async createCount(data: {
    companyId: number
    warehouseId: number
    countDate: Date
    notes?: string
    createdBy?: number
  }) {
    return prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: data.warehouseId, companyId: data.companyId },
      })
      if (!warehouse) throw new Error('المخزن غير موجود في هذه الشركة')

      const countNumber = generateNumber('CNT', await sequenceService.next(data.companyId, 'CNT', tx))

      const count = await tx.inventoryCount.create({
        data: {
          companyId: data.companyId,
          warehouseId: data.warehouseId,
          countNumber,
          countDate: data.countDate,
          notes: data.notes,
          createdBy: data.createdBy,
        },
      })

      // جلب جميع الأصناف النشطة في الشركة
      const allItems = await tx.item.findMany({
        where: { companyId: data.companyId, isActive: true },
        orderBy: { itemName: 'asc' },
      })

      // جلب stock الموجودة في المخزن للدمج
      const existingStock = await tx.stock.findMany({
        where: { warehouseId: data.warehouseId },
      })
      const stockMap = new Map(existingStock.map((s) => [s.itemId, s]))

      // إنشاء بنود الجرد لجميع الأصناف النشطة
      for (const item of allItems) {
        const stock = stockMap.get(item.id)
        await tx.inventoryCountItem.create({
          data: {
            countId: count.id,
            itemId: item.id,
            systemQty: stock?.quantity ?? 0,
            countedQty: 0,
            countedGoodQty: 0,
            countedDamagedQty: 0,
            difference: 0,
            unitCost: item.costPrice,
            varianceValue: 0,
          },
        })
      }

      return tx.inventoryCount.findUnique({
        where: { id: count.id },
        include: { warehouse: true, items: { include: { item: true } } },
      })
    }, { timeout: 30000 })
  }

  /**
   * جرد صنف: مقارنة الجرد النظامي بالمعدود (صالح + تالف)
   */
  async processCountItem(
    countId: number,
    itemId: number,
    countedGoodQty: number,
    countedDamagedQty: number,
    unitCost?: number
  ) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({ where: { id: countId } })
      if (!count) throw new Error('الجرد غير موجود')
      if (count.status === 'posted') throw new Error('الجرد تم ترحيله مسبقاً')

      const stock = await tx.stock.findUnique({
        where: {
          itemId_warehouseId: {
            itemId,
            warehouseId: count.warehouseId,
          },
        },
      })

      const systemQty = stock?.quantity.toNumber() || 0
      const countedQty = countedGoodQty + countedDamagedQty
      const difference = countedQty - systemQty

      const countItem = await tx.inventoryCountItem.upsert({
        where: {
          countId_itemId: { countId, itemId },
        },
        create: {
          countId,
          itemId,
          systemQty,
          countedQty,
          countedGoodQty,
          countedDamagedQty,
          difference,
          unitCost: unitCost ?? null,
          varianceValue: unitCost != null ? difference * unitCost : null,
        },
        update: {
          countedQty,
          countedGoodQty,
          countedDamagedQty,
          difference,
          unitCost: unitCost ?? undefined,
          varianceValue: unitCost != null ? difference * unitCost : undefined,
        },
      })

      return countItem
    })
  }

  /**
   * ترحيل الجرد: تطبيق الفروقات على المخزون من الرصيد الحي لحظة الترحيل
   */
  async postCount(countId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({
        where: { id: countId },
        include: { items: true },
      })
      if (!count) throw new Error('الجرد غير موجود')
      if (count.status === 'posted') throw new Error('الجرد تم ترحيله مسبقاً')

      for (const ci of count.items) {
        const good = ci.countedGoodQty.toNumber()
        const damaged = ci.countedDamagedQty.toNumber()
        const newTotal = good + damaged

        // الرصيد الحي لحظة الترحيل (مصدر الحقيقة للفروقات)
        const stock = await tx.stock.findUnique({
          where: {
            itemId_warehouseId: {
              itemId: ci.itemId,
              warehouseId: count.warehouseId,
            },
          },
        })
        const sysTotal = stock?.quantity.toNumber() ?? 0
        const sysDamaged = stock?.damagedStock?.toNumber() ?? 0
        const sysValid = sysTotal - sysDamaged

        const goodDiff = good - sysValid
        const damagedDiff = damaged - sysDamaged
        const totalDiff = newTotal - sysTotal

        if (goodDiff === 0 && damagedDiff === 0) continue

        // تحديث رصيد المخزن
        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: newTotal, damagedStock: damaged },
          })
        }

        // تحديث الرصيد الإجمالي للصنف + إعادة حساب التكلفة (قيمة المخزون تُوزَّع على الصالح)
        const item = await tx.item.findUnique({ where: { id: ci.itemId } })
        if (item) {
          const value = item.currentStock.toNumber() * item.costPrice.toNumber()
          const companyTotal = item.currentStock.toNumber() + totalDiff
          const companyDamaged = item.damagedStock.toNumber() + damagedDiff
          const companyValid = companyTotal - companyDamaged
          const newCost = companyValid > 0 ? value / companyValid : 0
          const unitCost = ci.unitCost?.toNumber() ?? newCost

          await tx.item.update({
            where: { id: ci.itemId },
            data: {
              currentStock: { increment: totalDiff },
              damagedStock: { increment: damagedDiff },
              costPrice: newCost,
            },
          })

          // حركة تعديل الصالح
          if (goodDiff !== 0) {
            await tx.stockMovement.create({
              data: {
                companyId: count.companyId,
                movementDate: new Date(),
                movementType: MOVEMENT_TYPES.INVENTORY_ADJUSTMENT_GOOD,
                referenceType: 'inventory_count',
                referenceId: count.id,
                itemId: ci.itemId,
                warehouseId: count.warehouseId,
                quantity: goodDiff,
                unitCost: ci.unitCost,
                totalCost: goodDiff * unitCost,
                balanceAfter: good,
                createdBy: userId,
              },
            })
          }

          // حركة تعديل التالف
          if (damagedDiff !== 0) {
            await tx.stockMovement.create({
              data: {
                companyId: count.companyId,
                movementDate: new Date(),
                movementType: MOVEMENT_TYPES.INVENTORY_ADJUSTMENT_DAMAGED,
                referenceType: 'inventory_count',
                referenceId: count.id,
                itemId: ci.itemId,
                warehouseId: count.warehouseId,
                quantity: damagedDiff,
                unitCost: ci.unitCost,
                totalCost: damagedDiff * unitCost,
                balanceAfter: damaged,
                createdBy: userId,
              },
            })
          }
        }
      }

      return tx.inventoryCount.update({
        where: { id: countId },
        data: {
          status: 'posted',
          postedAt: new Date(),
          postedBy: userId,
        },
      })
    })
  }

  /**
   * جرد تصحيحي جديد من جد مرحّل (posted):
   * - من الرصيد الحي لحظة الإنشاء، countDate = الآن، notes تُنسخ مع بادئة «تصحيحي لـ #CNT-...»
   * - يربط بالأصل عبر parentCountId ويظهر فرعياً في الواجهة
   * - للمستخدم المربوط بفرع: يُرفض إن لم يملك الجرد الأصلي (فرع مخزنه ≠ فرع المستخدم)
   * - يبيّن جميع الأصناف النشطة (مثل الجرد العادي)
   */
  async createCorrectiveCount(companyId: number, parentId: number, userId: number, allowedBranchId?: number | null) {
    return prisma.$transaction(async (tx) => {
      const parent = await tx.inventoryCount.findFirst({
        where: { id: parentId, companyId },
        include: { warehouse: true },
      })
      if (!parent) throw new Error('الجرد الأصلي غير موجود')
      if (parent.status !== 'posted') throw new Error('الجرد التصحيحي يُنشأ من جرد مرحّل فقط')

      // تحقق ملكية المخزن/الفرع (عزل الفرع)
      if (allowedBranchId != null && parent.warehouse.branchId !== allowedBranchId) {
        throw new Error('لا يمكن إنشاء جرد تصحيحي من جرد لا يتبع فرعك')
      }

      const countNumber = generateNumber('CNT', await sequenceService.next(companyId, 'CNT', tx))

      const count = await tx.inventoryCount.create({
        data: {
          companyId,
          warehouseId: parent.warehouseId,
          countNumber,
          countDate: new Date(),
          notes: `تصحيحي لـ #${parent.countNumber}${parent.notes ? ` — ${parent.notes}` : ''}`,
          parentCountId: parent.id,
          createdBy: userId,
        },
      })

      // جلب جميع الأصناف النشطة في الشركة (مثل الجرد العادي)
      const allItems = await tx.item.findMany({
        where: { companyId, isActive: true },
        orderBy: { itemName: 'asc' },
      })

      // جلب stock الموجودة في المخزن للدمج
      const existingStock = await tx.stock.findMany({
        where: { warehouseId: parent.warehouseId },
      })
      const stockMap = new Map(existingStock.map((s) => [s.itemId, s]))

      // إنشاء بنود الجرد لجميع الأصناف النشطة
      for (const item of allItems) {
        const stock = stockMap.get(item.id)
        await tx.inventoryCountItem.create({
          data: {
            countId: count.id,
            itemId: item.id,
            systemQty: stock?.quantity ?? 0,
            countedQty: 0,
            countedGoodQty: 0,
            countedDamagedQty: 0,
            difference: 0,
            unitCost: item.costPrice,
            varianceValue: 0,
          },
        })
      }

      return tx.inventoryCount.findUnique({
        where: { id: count.id },
        include: { warehouse: true, parentCount: true, items: { include: { item: true } } },
      })
    }, { timeout: 30000 })
  }

  /**
   * جلب جرد واحد ببندانه (صالح/تالف) مع مخزنه وفرعه
   */
  async getCountById(companyId: number, countId: number) {
    const count = await prisma.inventoryCount.findFirst({
      where: { id: countId, companyId },
      include: {
        warehouse: { include: { branch: true } },
        creator: true,
        poster: true,
        parentCount: true,
        items: { include: { item: true } },
      },
    })
    if (!count) throw new Error('الجرد غير موجود')
    return count
  }

  /**
   * تقرير قيمة المخزون
   */
  async getStockValuation(companyId: number, warehouseId?: number, branchId?: number) {
    const stock = await prisma.stock.findMany({
      where: {
        companyId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(branchId ? { warehouse: { branchId } } : {}),
        quantity: { gt: 0 },
      },
      include: {
        item: true,
        warehouse: true,
      },
      orderBy: { item: { itemName: 'asc' } },
    })

    const total = stock.reduce((s, st) => s + st.quantity.toNumber() * st.item.costPrice.toNumber(), 0)

    return {
      items: stock.map((st) => {
        const damagedQty = st.damagedStock?.toNumber() ?? 0
        const qty = st.quantity.toNumber()
        return {
          itemId: st.itemId,
          itemCode: st.item.itemCode,
          itemName: st.item.itemName,
          warehouseName: st.warehouse.name,
          quantity: qty,
          damagedStock: damagedQty,
          validStock: qty - damagedQty,
          costPrice: st.item.costPrice.toNumber(),
          totalValue: qty * st.item.costPrice.toNumber(),
        }
      }),
      totalValue: total,
    }
  }
}

export const inventoryService = new InventoryService()
