package com.example.ponto.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "work_days")
data class WorkDay(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val date: String, // Formato yyyy-MM-dd
    val entranceTime: Long, // Timestamp
    val exitTime: Long? = null, // Timestamp (nulo até bater a saída)
    val expectedHours: Int // Carga horária esperada (ex: 8)
)
