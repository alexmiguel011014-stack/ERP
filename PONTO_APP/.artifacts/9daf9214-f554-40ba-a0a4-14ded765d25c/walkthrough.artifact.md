# Walkthrough - Aplicativo de Ponto

O aplicativo de "Bater Ponto" foi implementado com sucesso seguindo as melhores práticas de desenvolvimento Android moderno.

## Funcionalidades Implementadas

1.  **Persistência de Dados**:
    *   **Room Database**: Armazena os registros de `WorkDay` (ID, Data, Entrada, Saída, Carga Horária).
    *   **DataStore**: Salva a configuração de "Carga Horária Diária" do usuário.

2.  **Lógica de Negócio (MVVM)**:
    *   Cálculo automático de saldo diário e banco de horas acumulado.
    *   Gerenciamento de estado reativo usando `StateFlow`.
    *   Formatação de horários e durações trabalhadas.

3.  **Interface do Usuário (Jetpack Compose)**:
    *   **Tela de Registro**: Interface intuitiva para bater ponto e configurar a carga horária.
    *   **Tela de Histórico**: Lista detalhada de todos os dias trabalhados com indicação de saldo positivo/negativo.
    *   **Navegação**: Bottom Navigation para alternar entre as abas.

4.  **Configuração Técnica**:
    *   Migrado para **Kotlin 2.0** e **AGP 9.3.1**.
    *   Uso de **Material 3** para um design moderno.

## Como usar
1.  Na aba **Registro**, defina sua carga horária diária (ex: 8h).
2.  Clique em **Bater Ponto de Entrada** ao iniciar o trabalho.
3.  Ao terminar, clique em **Bater Ponto de Saída**.
4.  Acompanhe seu saldo total na aba **Histórico**.
