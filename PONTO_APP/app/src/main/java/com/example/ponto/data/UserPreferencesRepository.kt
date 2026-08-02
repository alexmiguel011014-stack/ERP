package com.example.ponto.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "user_preferences")

class UserPreferencesRepository(private val context: Context) {
    private val EXPECTED_HOURS_KEY = intPreferencesKey("expected_hours")

    val expectedHours: Flow<Int> = context.dataStore.data.map { preferences ->
        preferences[EXPECTED_HOURS_KEY] ?: 8 // Padrão 8 horas
    }

    suspend fun saveExpectedHours(hours: Int) {
        context.dataStore.edit { preferences ->
            preferences[EXPECTED_HOURS_KEY] = hours
        }
    }
}
