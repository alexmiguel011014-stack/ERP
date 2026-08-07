package com.example.ponto.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.ponto.data.AppDatabase
import com.example.ponto.data.UserPreferencesRepository
import com.example.ponto.data.WorkDayRepository
import com.example.ponto.model.WorkDay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repository: WorkDayRepository
    private val userPrefs: UserPreferencesRepository

    val allWorkDays: StateFlow<List<WorkDay>>
    val expectedHours: StateFlow<Int>
    val activeWorkDay = MutableStateFlow<WorkDay?>(null)

    init {
        val dao = AppDatabase.getDatabase(application).workDayDao()
        repository = WorkDayRepository(dao)
        userPrefs = UserPreferencesRepository(application)

        allWorkDays = repository.allWorkDays.stateIn(
            viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList(),
        )

        expectedHours = userPrefs.expectedHours.stateIn(
            viewModelScope, SharingStarted.WhileSubscribed(5000), 8,
        )

        refreshActiveWorkDay()
    }

    private fun refreshActiveWorkDay() {
        viewModelScope.launch {
            activeWorkDay.value = repository.getActiveWorkDay()
        }
    }

    fun punchIn() {
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val date = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(now))
            val newWorkDay = WorkDay(
                date = date,
                entranceTime = now,
                expectedHours = expectedHours.value,
            )
            repository.insert(newWorkDay)
            refreshActiveWorkDay()
        }
    }

    fun punchOut() {
        viewModelScope.launch {
            activeWorkDay.value?.let { active ->
                val updated = active.copy(exitTime = System.currentTimeMillis())
                repository.update(updated)
                refreshActiveWorkDay()
            }
        }
    }

    fun deleteWorkDay(workDay: WorkDay) {
        viewModelScope.launch {
            repository.delete(workDay)
            refreshActiveWorkDay()
        }
    }

    fun updateWorkDayTimes(workDay: WorkDay, entranceTime: Long, exitTime: Long?) {
        viewModelScope.launch {
            val updated = workDay.copy(entranceTime = entranceTime, exitTime = exitTime)
            repository.update(updated)
            refreshActiveWorkDay()
        }
    }

    fun saveExpectedHours(hours: Int) {
        viewModelScope.launch {
            userPrefs.saveExpectedHours(hours)
        }
    }

    fun calculateBalance(workDays: List<WorkDay>): Double {
        var totalBalance = 0.0
        workDays.forEach { day ->
            day.exitTime?.let { exit ->
                val workedMillis = exit - day.entranceTime
                val workedHours = workedMillis.toDouble() / (1000 * 60 * 60)
                totalBalance += (workedHours - day.expectedHours)
            }
        }
        return totalBalance
    }

    fun formatDuration(startTime: Long, endTime: Long?): String {
        if (endTime == null) return "Em andamento"
        val durationMillis = endTime - startTime
        val hours = durationMillis / (1000 * 60 * 60)
        val minutes = (durationMillis / (1000 * 60)) % 60
        return String.format(Locale.getDefault(), "%02dh %02dm", hours, minutes)
    }

    fun formatTime(timestamp: Long): String {
        return SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
    }

    fun generateCsvExport(workDays: List<WorkDay>): String {
        val sb = StringBuilder()
        sb.append("Data,Entrada,Saida,Carga Esperada,Trabalhado,Saldo\n")
        
        workDays.forEach { day ->
            val entrance = formatTime(day.entranceTime)
            val exit = day.exitTime?.let { formatTime(it) } ?: "--:--"
            val duration = if (day.exitTime != null) {
                val workedMillis = day.exitTime - day.entranceTime
                workedMillis.toDouble() / (1000 * 60 * 60)
            } else 0.0
            val balance = if (day.exitTime != null) duration - day.expectedHours else 0.0
            
            sb.append("${day.date},$entrance,$exit,${day.expectedHours},")
            sb.append(String.format(Locale.US, "%.2f", duration))
            sb.append(",")
            sb.append(String.format(Locale.US, "%.2f", balance))
            sb.append("\n")
        }
        return sb.toString()
    }
}
