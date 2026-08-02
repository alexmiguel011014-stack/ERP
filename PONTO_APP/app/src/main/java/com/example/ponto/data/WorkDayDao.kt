package com.example.ponto.data

import androidx.room.*
import com.example.ponto.model.WorkDay
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkDayDao {
    @Insert
    suspend fun insert(workDay: WorkDay)

    @Update
    suspend fun update(workDay: WorkDay)

    @Query("SELECT * FROM work_days ORDER BY entranceTime DESC")
    fun getAllWorkDays(): Flow<List<WorkDay>>

    @Query("SELECT * FROM work_days WHERE date = :date LIMIT 1")
    suspend fun getWorkDayByDate(date: String): WorkDay?

    @Query("SELECT * FROM work_days WHERE exitTime IS NULL LIMIT 1")
    suspend fun getActiveWorkDay(): WorkDay?
}
