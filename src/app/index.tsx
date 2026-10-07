import React, { useEffect, useState } from 'react';

import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
    StyleSheet,
  Alert,
  Platform,
} from 'react-native';

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import { useAppTheme } from '@/context/ThemeContext';
import {
  listarGravacoesApi,
  enviarGravacaoApi,
  eliminarGravacaoApi,
  type GravacaoApi,
} from '../../lib/pythonApi';

type Gravacao = GravacaoApi;

export default function Index() {
  const { isDarkMode, toggleTheme } = useAppTheme();

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const estado = useAudioRecorderState(gravador);
  const leitor = useAudioPlayer(null);
  const estadoLeitor = useAudioPlayerStatus(leitor);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  const [permissao, setPermissao] = useState(false);
  const [gravacoes, setGravacoes] = useState<Gravacao[]>([]);
  const [nome, setNome] = useState('');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [menuAberto, setMenuAberto] = useState(false);
  const [tela, setTela] = useState<'gravar' | 'gravacoes'>('gravar');

  // =========================================================
  // CARREGAR GRAVAÇÕES DA API PYTHON (data.json)
  // =========================================================

  async function carregarGravacoes() {
    try {
      setCarregado(false);

      const lista = await listarGravacoesApi();
      setGravacoes(lista);
    } catch (erro) {
      console.log('Erro ao carregar gravações da API:', erro);

      Alert.alert(
        'Erro',
        'Não foi possível carregar as gravações da API Python.'
      );
    } finally {
      setCarregado(true);
    }
  }

  // =========================================================
  // INICIAR APLICAÇÃO
  // =========================================================

  useEffect(() => {
    async function iniciar() {
      try {
        const resultado =
          await AudioModule.requestRecordingPermissionsAsync();

        setPermissao(resultado.granted);

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await carregarGravacoes();
      } catch (erro) {
        console.log('Erro ao iniciar:', erro);
        setCarregado(true);
      }
    }

    iniciar();
  }, []);

  // =========================================================
  // INICIAR GRAVAÇÃO
  // =========================================================

  async function iniciarGravacao() {
    try {
      if (!permissao) {
        Alert.alert(
          'Microfone',
          'Autoriza o acesso ao microfone nas definições do navegador ou dispositivo.'
        );

        return;
      }

      setSelecionada(null);

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await gravador.prepareToRecordAsync();

      gravador.record();
    } catch (erro) {
      console.log('Erro ao iniciar gravação:', erro);

      Alert.alert(
        'Erro',
        'Não foi possível iniciar a gravação.'
      );
    }
  }

  // =========================================================
  // PARAR E ENVIAR PARA A API PYTHON
  // =========================================================

  async function pararGravacao() {
    try {
      setEnviando(true);

      await gravador.stop();

      const uri = gravador.uri;

      if (!uri) {
        Alert.alert(
          'Erro',
          'Não foi encontrado o áudio gravado.'
        );

        return;
      }

      const nomeFinal =
        nome.trim() ||
        `Gravação ${gravacoes.length + 1}`;

      // Envia para a API Python, que salva o arquivo em uploads/ e os metadados em data.json
      await enviarGravacaoApi(uri, nomeFinal);

      setNome('');

      await carregarGravacoes();

      Alert.alert(
        'Sucesso',
        'Gravação guardada com sucesso no data.json!'
      );
    } catch (erro) {
      console.log(
        'Erro ao guardar gravação:',
        erro
      );

      Alert.alert(
        'Erro',
        'Não foi possível enviar a gravação para a API Python.'
      );
    } finally {
      setEnviando(false);
    }
  }

  // =========================================================
  // REPRODUZIR
  // =========================================================

  async function reproduzir(item: Gravacao) {
    if (!item.uri) {
      Alert.alert('Erro', 'O endereço do áudio não está disponível.');
      return;
    }

    try {
      if (selecionada === item.id && estadoLeitor.playing) {
        leitor.pause();
        return;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (selecionada === item.id) {
        leitor.play();
      } else {
        leitor.replace({ uri: item.uri });
        setSelecionada(item.id);
        leitor.play();
      }
    } catch (erro) {
      console.log('Erro ao reproduzir:', erro);
      Alert.alert('Erro', 'Não foi possível reproduzir o áudio.');
    }
  }

  function formatarTempo(segundos: number) {
    const total = Math.max(0, Math.floor(segundos || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
      total % 60
    ).padStart(2, '0')}`;
  }

  async function eliminarGravacao(item: Gravacao) {
  if (aEliminar) return;

  // Confirmação no navegador
  if (Platform.OS === 'web') {
    const confirmar = window.confirm(
      `Queres eliminar "${item.nome}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmar) return;

    await executarEliminacao(item);
    return;
  }

  // Confirmação no Android
  Alert.alert(
    'Eliminar gravação',
    `Queres eliminar "${item.nome}"?`,
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void executarEliminacao(item);
        },
      },
    ]
  );
}

async function executarEliminacao(item: Gravacao) {
  if (aEliminar) return;

  setAEliminar(item.id);

  try {
    // Parar o áudio se estiver selecionado
    if (selecionada === item.id) {
      leitor.pause();
      setSelecionada(null);
    }

    // Apagar na API Python (remove do data.json e exclui do disco)
    await eliminarGravacaoApi(item.id);

    // Actualizar a lista no ecrã
    setGravacoes((lista) =>
      lista.filter((gravacao) => gravacao.id !== item.id)
    );

    if (Platform.OS === 'web') {
      window.alert('Gravação eliminada com sucesso!');
    } else {
      Alert.alert(
        'Concluído',
        'Gravação eliminada com sucesso!'
      );
    }
  } catch (erro) {
    console.error('Erro ao eliminar gravação:', erro);

    if (Platform.OS === 'web') {
      window.alert(
        'Não foi possível eliminar a gravação na API Python.'
      );
    } else {
      Alert.alert(
        'Erro ao eliminar',
        'Não foi possível eliminar a gravação na API Python.'
      );
    }
  } finally {
    setAEliminar(null);
  }
}
  // =========================================================
  // FORMATAR DATA
  // =========================================================

  function formatarData(data?: string) {
    if (!data) {
      return 'Data desconhecida';
    }

    try {
      return new Date(data).toLocaleString('pt-PT');
    } catch {
      return 'Data desconhecida';
    }
  }

  // =========================================================
  // TEMPO DA GRAVAÇÃO
  // =========================================================

  const segundos = Math.floor(
    estado.durationMillis / 1000
  );

  const tempo =
    `${String(
      Math.floor(segundos / 60)
    ).padStart(2, '0')}:` +
    `${String(
      segundos % 60
    ).padStart(2, '0')}`;

  // =========================================================
  // CORES
  // =========================================================

  const fundo = isDarkMode
    ? '#0F172A'
    : '#F1F5F9';

  const superficie = isDarkMode
    ? '#1E293B'
    : '#FFFFFF';

  const texto = isDarkMode
    ? '#F8FAFC'
    : '#0F172A';

  const textoSecundario = isDarkMode
    ? '#CBD5E1'
    : '#64748B';

  // =========================================================
  // INTERFACE
  // =========================================================

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: fundo,
        },
      ]}
    >

      {/* =====================================================
          CABEÇALHO
      ===================================================== */}

      <View
        style={[
          styles.cabecalho,
          {
            backgroundColor: superficie,
          },
        ]}
      >

        <TouchableOpacity
          style={styles.botaoMenu}
          onPress={() =>
            setMenuAberto(!menuAberto)
          }
        >
          <Text
            style={[
              styles.iconeMenu,
              {
                color: texto,
              },
            ]}
          >
            ☰
          </Text>
        </TouchableOpacity>

        <View style={styles.tituloCabecalho}>
          <Text
            style={[
              styles.tituloCabecalhoTexto,
              {
                color: texto,
              },
            ]}
          >
            Gravador de Áudio
          </Text>

          <Text
            style={[
              styles.subtituloCabecalho,
              {
                color: textoSecundario,
              },
            ]}
          >
            Gravações online
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.botaoTema,
            {
              backgroundColor: isDarkMode
                ? '#334155'
                : '#E2E8F0',
            },
          ]}
          onPress={toggleTheme}
        >
          <Text style={styles.iconeTema}>
            {isDarkMode ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>

      </View>

      {/* =====================================================
          MENU
      ===================================================== */}

      {menuAberto && (
        <View
          style={[
            styles.menu,
            {
              backgroundColor: superficie,
            },
          ]}
        >

          <Text
            style={[
              styles.menuTitulo,
              {
                color: texto,
              },
            ]}
          >
            Menu
          </Text>

          {/* GRAVAR */}

          <TouchableOpacity
            style={[
              styles.menuItem,
              tela === 'gravar' &&
                styles.menuItemSelecionado,
            ]}
            onPress={() => {
              setTela('gravar');
              setMenuAberto(false);
            }}
          >
            <Text style={styles.menuIcone}>
              🎙️
            </Text>

            <Text
              style={[
                styles.menuTexto,
                {
                  color: texto,
                },
              ]}
            >
              Gravar
            </Text>
          </TouchableOpacity>

          {/* TODAS AS GRAVAÇÕES */}

          <TouchableOpacity
            style={[
              styles.menuItem,
              tela === 'gravacoes' &&
                styles.menuItemSelecionado,
            ]}
            onPress={() => {
              setTela('gravacoes');
              setMenuAberto(false);
              carregarGravacoes();
            }}
          >
            <Text style={styles.menuIcone}>
              📁
            </Text>

            <View style={styles.menuTextoArea}>
              <Text
                style={[
                  styles.menuTexto,
                  {
                    color: texto,
                  },
                ]}
              >
                Todas as gravações
              </Text>

              <Text
                style={[
                  styles.menuQuantidade,
                  {
                    color: textoSecundario,
                  },
                ]}
              >
                {gravacoes.length} gravações
              </Text>
            </View>
          </TouchableOpacity>



        </View>
      )}

      {/* =====================================================
          TELA GRAVAR
      ===================================================== */}

      {tela === 'gravar' ? (

        <View style={styles.conteudo}>

          <Text
            style={[
              styles.tituloPrincipal,
              {
                color: texto,
              },
            ]}
          >
            🎙️ Gravar áudio
          </Text>

          <Text
            style={[
              styles.subtituloPrincipal,
              {
                color: textoSecundario,
              },
            ]}
          >
            Grave e guarde a sua gravação online
          </Text>

          {/* CARTÃO DO GRAVADOR */}

          <View
            style={[
              styles.cartao,
              {
                backgroundColor: superficie,
              },
            ]}
          >

            <View style={styles.circuloMicrofone}>
              <Text style={styles.microfone}>
                🎤
              </Text>
            </View>

            <Text
              style={[
                styles.estado,
                {
                  color: texto,
                },
              ]}
            >
              {enviando
                ? 'A enviar gravação...'
                : estado.isRecording
                ? 'A gravar áudio...'
                : 'Pronto para gravar'}
            </Text>

            <Text style={styles.tempo}>
              {tempo}
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDarkMode
                    ? '#334155'
                    : '#F8FAFC',

                  borderColor: isDarkMode
                    ? '#475569'
                    : '#CBD5E1',

                  color: texto,
                },
              ]}
              placeholder="Nome da gravação (opcional)"
              placeholderTextColor={
                isDarkMode
                  ? '#94A3B8'
                  : '#64748B'
              }
              value={nome}
              onChangeText={setNome}
              editable={
                !estado.isRecording &&
                !enviando
              }
            />

            <TouchableOpacity
              style={[
                styles.botaoGravar,
                {
                  backgroundColor:
                    estado.isRecording
                      ? '#DC2626'
                      : '#2563EB',

                  opacity: enviando
                    ? 0.6
                    : 1,
                },
              ]}
              onPress={
                estado.isRecording
                  ? pararGravacao
                  : iniciarGravacao
              }
              disabled={enviando}
            >
              <Text style={styles.textoBotao}>
                {enviando
                  ? '☁️ A enviar...'
                  : estado.isRecording
                  ? '■ Parar e guardar'
                  : '● Iniciar gravação'}
              </Text>
            </TouchableOpacity>

          </View>

          {/* ACESSO ÀS GRAVAÇÕES */}

          <TouchableOpacity
            style={[
              styles.cartaoGravacoes,
              {
                backgroundColor: superficie,
              },
            ]}
            onPress={() => {
              setTela('gravacoes');
              carregarGravacoes();
            }}
          >

            <View style={styles.iconePasta}>
              <Text style={styles.iconePastaTexto}>
                📁
              </Text>
            </View>

            <View style={styles.infoGravacoes}>
              <Text
                style={[
                  styles.nomeSecao,
                  {
                    color: texto,
                  },
                ]}
              >
                Todas as gravações
              </Text>

              <Text
                style={[
                  styles.descricaoSecao,
                  {
                    color: textoSecundario,
                  },
                ]}
              >
                {gravacoes.length} gravações guardadas online
              </Text>
            </View>

            <Text
              style={[
                styles.seta,
                {
                  color: textoSecundario,
                },
              ]}
            >
              ›
            </Text>

          </TouchableOpacity>

        </View>

      ) : (

        /* ===================================================
           TELA TODAS AS GRAVAÇÕES
        =================================================== */

        <View style={styles.conteudoLista}>

          <View style={styles.tituloListaArea}>

            <TouchableOpacity
              style={styles.botaoVoltar}
              onPress={() => setTela('gravar')}
            >
              <Text
                style={[
                  styles.voltarTexto,
                  {
                    color: texto,
                  },
                ]}
              >
                ‹
              </Text>
            </TouchableOpacity>

            <View>
              <Text
                style={[
                  styles.tituloLista,
                  {
                    color: texto,
                  },
                ]}
              >
                Todas as gravações
              </Text>

              <Text
                style={[
                  styles.contadorLista,
                  {
                    color: textoSecundario,
                  },
                ]}
              >
                {gravacoes.length} gravações
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.botaoAtualizar,
                {
                  backgroundColor: isDarkMode
                    ? '#334155'
                    : '#DBEAFE',
                },
              ]}
              onPress={carregarGravacoes}
            >
              <Text style={styles.textoAtualizar}>
                🔄
              </Text>
            </TouchableOpacity>

          </View>

          {!carregado ? (

            <Text
              style={[
                styles.vazio,
                {
                  color: textoSecundario,
                },
              ]}
            >
              A carregar gravações...
            </Text>

          ) : (

            <FlatList
              data={gravacoes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={
                gravacoes.length === 0
                  ? styles.listaVazia
                  : styles.lista
              }
              ListEmptyComponent={
                <View style={styles.semGravacoes}>

                  <Text style={styles.iconeSemGravacoes}>
                    🎙️
                  </Text>

                  <Text
                    style={[
                      styles.textoSemGravacoes,
                      {
                        color: texto,
                      },
                    ]}
                  >
                    Ainda não existem gravações
                  </Text>

                  <Text
                    style={[
                      styles.subtextoSemGravacoes,
                      {
                        color: textoSecundario,
                      },
                    ]}
                  >
                    As gravações que fizeres aparecerão aqui.
                  </Text>

                </View>
              }
              renderItem={({ item, index }) => (

                <View
                  style={[
                    styles.itemGravacao,
                    {
                      backgroundColor: superficie,
                    },
                  ]}
                >

                  <View style={styles.numeroGravacao}>
                    <Text style={styles.numeroTexto}>
                      {index + 1}
                    </Text>
                  </View>

                  <View style={styles.dadosGravacao}>

                    <Text
                      style={[
                        styles.nomeAudio,
                        {
                          color: texto,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.nome}
                    </Text>

                    <Text
                      style={[
                        styles.dataAudio,
                        {
                          color: textoSecundario,
                        },
                      ]}
                    >
                      📅 {formatarData(item.criado_em)}
                    </Text>

                    {selecionada === item.id && (
                      <Text
                        style={[
                          styles.tempoAudio,
                          { color: textoSecundario },
                        ]}
                      >
                        {estadoLeitor.playing ? '▶ A reproduzir' : '⏸ Em pausa'} ·{' '}
                        {formatarTempo(estadoLeitor.currentTime)} /{' '}
                        {formatarTempo(estadoLeitor.duration)}
                      </Text>
                    )}

                    <Text
                      style={[
                        styles.onlineAudio,
                        {
                          color: '#16A34A',
                        },
                      ]}
                    >
                      ☁️ Guardado online
                    </Text>

                  </View>

                  <TouchableOpacity
                    style={[
                      styles.botaoOuvir,
                      {
                        backgroundColor:
                          selecionada === item.id
                            ? '#2563EB'
                            : isDarkMode
                            ? '#1E40AF'
                            : '#DBEAFE',
                      },
                    ]}
                    onPress={() =>
                      reproduzir(item)
                    }
                  >
                    <Text
                      style={[
                        styles.textoOuvir,
                        {
                          color:
                            selecionada === item.id
                              ? '#FFFFFF'
                              : '#1D4ED8',
                        },
                      ]}
                    >
                      {selecionada === item.id && estadoLeitor.playing ? 'Ⅱ' : '▶'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.botaoEliminar,
                      { opacity: aEliminar === item.id ? 0.5 : 1 },
                    ]}
                    onPress={() => eliminarGravacao(item)}
                    disabled={aEliminar === item.id}
                    accessibilityLabel="Eliminar gravação"
                  >
                    <Text style={styles.textoBotaoEliminar}>
                      {aEliminar === item.id ? '…' : '🗑️'}
                    </Text>
                  </TouchableOpacity>

                </View>

              )}
            />

          )}

        </View>

      )}

      {/* =====================================================
          RODAPÉ
      ===================================================== */}

      <Text
        style={[
          styles.rodape,
          {
            color: isDarkMode
              ? '#64748B'
              : '#94A3B8',
          },
        ]}
      >
        As gravações ficam guardadas na API Python (data.json).
      </Text>

    </View>
  );
}

// ===========================================================
// ESTILOS
// ===========================================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },

  // =========================================================
  // CABEÇALHO
  // =========================================================

  cabecalho: {
    height: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },

  botaoMenu: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },

  iconeMenu: {
    fontSize: 29,
    fontWeight: 'bold',
  },

  tituloCabecalho: {
    flex: 1,
    marginLeft: 8,
  },

  tituloCabecalhoTexto: {
    fontSize: 18,
    fontWeight: 'bold',
  },

  subtituloCabecalho: {
    fontSize: 11,
    marginTop: 2,
  },

  botaoTema: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconeTema: {
    fontSize: 18,
  },

  // =========================================================
  // MENU
  // =========================================================

  menu: {
    position: 'absolute',
    top: 72,
    left: 0,
    width: 310,
    zIndex: 100,
    elevation: 10,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 12,
    borderBottomRightRadius: 18,
  },

  menuTitulo: {
    fontSize: 21,
    fontWeight: 'bold',
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  menuItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 5,
  },

  menuItemSelecionado: {
    backgroundColor: '#DBEAFE',
  },

  menuIcone: {
    fontSize: 24,
    width: 40,
  },

  menuTextoArea: {
    flex: 1,
  },

  menuTexto: {
    fontSize: 15,
    fontWeight: '600',
  },

  menuQuantidade: {
    fontSize: 11,
    marginTop: 3,
  },

  // =========================================================
  // TELA DE GRAVAÇÃO
  // =========================================================

  conteudo: {
    flex: 1,
    padding: 24,
  },

  tituloPrincipal: {
    fontSize: 27,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },

  subtituloPrincipal: {
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 24,
  },

  cartao: {
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    elevation: 4,
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },

  circuloMicrofone: {
    width: 105,
    height: 105,
    borderRadius: 53,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  microfone: {
    fontSize: 50,
  },

  estado: {
    fontSize: 17,
    fontWeight: '600',
  },

  tempo: {
    fontSize: 46,
    fontWeight: 'bold',
    color: '#2563EB',
    marginVertical: 18,
    fontVariant: ['tabular-nums'],
  },

  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 11,
    padding: 14,
    marginBottom: 14,
  },

  botaoGravar: {
    width: '100%',
    padding: 17,
    borderRadius: 13,
    alignItems: 'center',
  },

  textoBotao: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // =========================================================
  // CARTÃO DE GRAVAÇÕES
  // =========================================================

  cartaoGravacoes: {
    marginTop: 18,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },

  iconePasta: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconePastaTexto: {
    fontSize: 25,
  },

  infoGravacoes: {
    flex: 1,
    marginLeft: 13,
  },

  nomeSecao: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  descricaoSecao: {
    fontSize: 12,
    marginTop: 4,
  },

  seta: {
    fontSize: 32,
    marginLeft: 8,
  },

  // =========================================================
  // LISTA
  // =========================================================

  conteudoLista: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  tituloListaArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  botaoVoltar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  voltarTexto: {
    fontSize: 38,
    fontWeight: '300',
  },

  tituloLista: {
    fontSize: 22,
    fontWeight: 'bold',
  },

  contadorLista: {
    fontSize: 12,
    marginTop: 3,
  },

  botaoAtualizar: {
    marginLeft: 'auto',
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textoAtualizar: {
    fontSize: 18,
  },

  lista: {
    paddingBottom: 20,
  },

  listaVazia: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  itemGravacao: {
    minHeight: 82,
    borderRadius: 15,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  numeroGravacao: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  numeroTexto: {
    color: '#1D4ED8',
    fontWeight: 'bold',
    fontSize: 15,
  },

  dadosGravacao: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  nomeAudio: {
    fontWeight: 'bold',
    fontSize: 15,
  },

  dataAudio: {
    fontSize: 11,
    marginTop: 4,
  },

  onlineAudio: {
    fontSize: 10,
    marginTop: 3,
    fontWeight: '600',
  },

  botaoOuvir: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  textoOuvir: {
    fontSize: 20,
    fontWeight: 'bold',
  },

  tempoAudio: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },

 botaoEliminar: {
  width: 42,
  height: 42,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#DC2626',
  marginLeft: 7,
},
textoBotaoEliminar: {
  fontSize: 17,
},

  // =========================================================
  // SEM GRAVAÇÕES
  // =========================================================

  semGravacoes: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  iconeSemGravacoes: {
    fontSize: 55,
    marginBottom: 15,
  },

  textoSemGravacoes: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  subtextoSemGravacoes: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  vazio: {
    textAlign: 'center',
    padding: 20,
  },

  // =========================================================
  // RODAPÉ
  // =========================================================

  rodape: {
    textAlign: 'center',
    fontSize: 11,
    padding: 12,
  },

});