import { prisma } from '../config/database'
import axios from 'axios'
import { CONFIG } from '../config'
import { DEFAULT_EXCHANGE_RATE_USD_LYD } from '../../../shared/constants'
import logger from '../config/logger'

// خدمة أسعار الصرف: تحديث تلقائي يومي من API مع إمكانية التعديل اليدوي
export class ExchangeRateService {
  /**
   * الحصول على سعر الصرف الحالي
   */
  async getRate(companyId: number, fromCurrency: string, toCurrency: string, date?: Date) {
    if (fromCurrency === toCurrency) return 1

    const rateDate = date || new Date()
    rateDate.setHours(0, 0, 0, 0)

    const rate = await prisma.exchangeRate.findFirst({
      where: {
        companyId,
        fromCurrency,
        toCurrency,
        rateDate: { lte: rateDate },
      },
      orderBy: { rateDate: 'desc' },
    })

    if (rate) return rate.rate.toNumber()

    // افتراضي: سعر دولار ثابت
    if (fromCurrency === 'USD' && toCurrency === 'LYD') return DEFAULT_EXCHANGE_RATE_USD_LYD
    if (fromCurrency === 'LYD' && toCurrency === 'USD') return 1 / DEFAULT_EXCHANGE_RATE_USD_LYD

    return 1
  }

  /**
   * تحديث أسعار الصرف من API
   */
  async updateRates(companyId: number) {
    if (!CONFIG.exchangeRate.apiKey) {
      logger.warn('Exchange rate API key not configured, using defaults')
      return { updated: false, message: 'API key غير مكون' }
    }

    try {
      const response = await axios.get(
        `${CONFIG.exchangeRate.baseUrl}/LYD?apiKey=${CONFIG.exchangeRate.apiKey}`
      )

      const rates = response.data?.rates
      if (!rates) throw new Error('استجابة غير صالحة من API')

      const usdLyd = rates.USD
      if (!usdLyd) throw new Error('سعر الدولار غير متوفر')

      await prisma.exchangeRate.create({
        data: {
          companyId,
          fromCurrency: 'USD',
          toCurrency: 'LYD',
          rate: usdLyd,
          isAuto: true,
          rateDate: new Date(),
        },
      })

      return { updated: true, rate: usdLyd }
    } catch (error) {
      logger.error('Exchange rate update failed:', error)
      return { updated: false, error: 'فشل تحديث سعر الصرف' }
    }
  }

  /**
   * تحديث يدوي لسعر الصرف
   */
  async setManualRate(companyId: number, fromCurrency: string, toCurrency: string, rate: number, date?: Date) {
    const rateDate = date || new Date()
    rateDate.setHours(0, 0, 0, 0)

    return prisma.exchangeRate.create({
      data: {
        companyId,
        fromCurrency,
        toCurrency,
        rate,
        isAuto: false,
        rateDate,
      },
    })
  }

  /**
   * سجل أسعار الصرف
   */
  async getRatesHistory(companyId: number, fromCurrency: string, toCurrency: string, limit = 30) {
    return prisma.exchangeRate.findMany({
      where: { companyId, fromCurrency, toCurrency },
      orderBy: { rateDate: 'desc' },
      take: limit,
    })
  }
}

export const exchangeRateService = new ExchangeRateService()
