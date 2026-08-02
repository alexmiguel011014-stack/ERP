# Plano de Implementação - Aplicativo de Ponto (PONTO)

Este plano descreve a criação de um aplicativo de rastreamento de tempo completo usando Kotlin, Jetpack Compose, Room e MVVM.

## Mudanças Propostas

### Configuração do Projeto

#### [MODIFY] [libs.versions.toml](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/gradle/libs.versions.toml)
Adicionar versões e bibliotecas para Room, DataStore, Compose, Navigation e Lifecycle.

#### [MODIFY] [build.gradle.kts](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/build.gradle.kts)
Habilitar o Jetpack Compose e adicionar as dependências necessárias.

---

### Camada de Dados (Data Layer)

#### [NEW] [WorkDay.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/model/WorkDay.kt)
Entidade Room que representa um dia de trabalho.

#### [NEW] [WorkDayDao.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/data/WorkDayDao.kt)
Interface DAO para operações no banco de dados.

#### [NEW] [AppDatabase.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/data/AppDatabase.kt)
Classe abstrata do banco de dados Room.

#### [NEW] [UserPreferencesRepository.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/data/UserPreferencesRepository.kt)
Gerenciamento da carga horária diária esperada usando DataStore.

#### [NEW] [WorkDayRepository.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/data/WorkDayRepository.kt)
Repositório para centralizar o acesso aos dados do Room.

---

### Camada de Interface (UI Layer)

#### [NEW] [MainViewModel.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/viewmodel/MainViewModel.kt)
ViewModel que gerencia o estado da UI e a lógica de cálculo de horas extras e banco de horas.

#### [NEW] [Navigation.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/ui/Navigation.kt)
Configuração da navegação entre as abas de Registro e Histórico.

#### [NEW] [RegisterScreen.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/ui/screens/RegisterScreen.kt)
Tela principal para bater ponto e configurar carga horária.

#### [NEW] [HistoryScreen.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/ui/screens/HistoryScreen.kt)
Tela de histórico com a lista de dias trabalhados e o banco de horas acumulado.

#### [MODIFY] [MainActivity.kt](file:///C:/Users/Alex/Desktop/sites/PONTO_APP/app/src/main/java/com/example/ponto/MainActivity.kt)
Ponto de entrada do aplicativo que configura o Compose e o Scaffold principal.

## Plano de Verificação

### Verificação Manual
1.  **Configuração**: Alterar a carga horária e verificar se é salva.
2.  **Registro**: Bater ponto de entrada e verificar se o status muda para "Trabalhando".
3.  **Saída**: Bater ponto de saída e verificar se o registro é atualizado no histórico.
4.  **Cálculo**: Verificar se o saldo de horas extras por dia e o banco de horas acumulado estão corretos.
5.  **Navegação**: Alternar entre as abas e verificar a persistência dos dados.
