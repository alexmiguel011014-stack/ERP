package com.example.ponto.data

import com.example.ponto.model.WorkDay
import kotlinx.coroutines.flow.Flow

class WorkDayRepository(private val workDayDao: WorkDayDao) {
    val allWorkDays: Flow<List<WorkDay>> = workDayDao.getAllWorkDays()

    suspend fun insert(workDay: WorkDay) {
        workDayDao.insert(workDay)
    }

    suspend fun update(workDay: WorkDay) {
        workDayDao.update(workDay)
    }

    suspend fun getActiveWorkDay(): WorkDay? {
        return workDayDao.getActiveWorkDay()
    }

    suspend fun delete(workDay: WorkDay) {
        workDayDao.delete(workDay)
    }
}
