import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PRODUCTS } from "../../src/store.js";
import { useShop } from "./ShopContext";

type Product = (typeof PRODUCTS)[number];
const categories = ["All", "Bags", "Jewelry", "Sunglasses"] as const;
const money = (kobo: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kobo / 100);

const colors = {
  paper: "#f5f2ea",
  card: "#fcfaf5",
  ink: "#282a22",
  olive: "#40513c",
  muted: "#817e73",
  line: "#dfdbcf",
  rust: "#ad5a41",
  white: "#fffdf8",
};

function ScreenHeader() {
  const router = useRouter();
  const { cartCount } = useShop();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.navigate("/")}>
        <Text style={styles.wordmark}>atelier <Text style={styles.wordmarkItalic}>june</Text><Text style={styles.registered}>®</Text></Text>
        <Text style={styles.wordmarkCaption}>OBJECTS TO KEEP</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.navigate("/bag")} style={styles.bagShortcut}>
        <Text style={styles.bagShortcutText}>BAG <Text style={styles.bagShortcutCount}>{cartCount}</Text></Text>
      </Pressable>
    </View>
  );
}

function Notice() {
  const { message, syncError, retryCartSync, setMessage } = useShop();
  const text = syncError || message;
  if (!text) return null;
  return (
    <View style={[styles.notice, syncError && styles.noticeError]}>
      <Text style={[styles.noticeText, syncError && styles.noticeTextError]}>{text}</Text>
      {syncError ? (
        <Pressable onPress={retryCartSync}>
          <Text style={styles.retryText}>TRY AGAIN</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityLabel="Dismiss message" onPress={() => setMessage("")}>
          <Text style={styles.dismissText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function ScreenFrame({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader />
      <Notice />
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        secondary && styles.actionButtonSecondary,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({ item }: { item: Product }) {
  const { addItem, cart, cartLoaded, cartLoading, session } = useShop();
  const quantity = cart.find((line) => line.productId === item.id)?.quantity ?? 0;
  return (
    <View style={styles.productCard}>
      <View style={styles.productImageWrap}>
        <Image source={{ uri: item.image }} style={styles.productImage} accessibilityLabel={item.alt} />
        {!!item.label && <Text style={styles.productLabel}>{item.label}</Text>}
      </View>
      <View style={styles.productDetails}>
        <Text numberOfLines={2} style={styles.productName}>{item.name}</Text>
        <Text style={styles.productPrice}>{money(item.priceKobo)}</Text>
        <Text style={styles.productColor}>{item.color}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(session) && (cartLoading || !cartLoaded)}
          onPress={() => addItem(item.id)}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed, Boolean(session) && (cartLoading || !cartLoaded) && styles.buttonDisabled]}
        >
          <Text style={styles.addButtonText}>
            {quantity ? `In your bag · ${quantity}   +` : "Add to bag   +"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ShopScreen() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const visibleProducts = useMemo(
    () => PRODUCTS.filter((product) => category === "All" || product.category === category),
    [category],
  );
  return (
    <ScreenFrame>
      <FlatList
        data={visibleProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.shopContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>A CONSIDERED COLLECTION · NO. 04</Text>
              <Text style={styles.heroTitle}>Objects to{"\n"}<Text style={styles.heroItalic}>keep.</Text></Text>
              <Text style={styles.heroIntro}>Everyday pieces, thoughtfully found. Made to go places, and stay with you.</Text>
              <Text style={styles.heroFoot}>GOOD THINGS, CHOSEN SLOWLY     ✳     EST. MMXXIV</Text>
              <View style={styles.heroStamp}><Text style={styles.heroStampText}>JUNE{"\n"}STUDIO</Text></View>
            </View>
            <View style={styles.collectionIntro}>
              <Text style={styles.kicker}>THE JUNE SELECTION</Text>
              <Text style={styles.sectionTitle}>A few good things.</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
            >
              {categories.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setCategory(value)}
                  style={[styles.categoryChip, category === value && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>
                    {value === "All" ? "All pieces" : value}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => <ProductCard item={item} />}
      />
    </ScreenFrame>
  );
}

export function BagScreen() {
  const router = useRouter();
  const {
    actionLoading,
    cart,
    cartCount,
    cartLoaded,
    cartLoading,
    changeQuantity,
    checkout,
    delivery,
    session,
    syncError,
    subtotal,
    retryCartSync,
  } = useShop();

  return (
    <ScreenFrame>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Text style={styles.kicker}>YOUR EVERYDAY EDIT · {cartCount} {cartCount === 1 ? "PIECE" : "PIECES"}</Text>
        <Text style={styles.pageTitle}>Your bag.</Text>
        {!session ? (
          <View style={styles.emptyBag}>
            <Text style={styles.emptyMark}>✳</Text>
            <Text style={styles.emptyTitle}>Your bag is waiting.</Text>
            <Text style={styles.bodyCopy}>Sign in to see the same saved pieces as your website account.</Text>
            <ActionButton label="Sign in to your account" onPress={() => router.navigate("/account")} />
          </View>
        ) : cartLoading ? (
          <ActivityIndicator color={colors.olive} style={styles.loading} />
        ) : !cartLoaded ? (
          <View style={styles.emptyBag}>
            <Text style={styles.emptyTitle}>Your bag could not load.</Text>
            <Text style={styles.bodyCopy}>{syncError || "Reconnect to load your saved pieces."}</Text>
            <ActionButton label="Try again" onPress={retryCartSync} />
          </View>
        ) : cart.length === 0 ? (
          <View style={styles.emptyBag}>
            <Text style={styles.emptyMark}>✳</Text>
            <Text style={styles.emptyTitle}>A little room for something lovely.</Text>
            <Text style={styles.bodyCopy}>Your bag is waiting to be filled with a few good things.</Text>
            <ActionButton label="Explore the collection" onPress={() => router.navigate("/")} />
          </View>
        ) : (
          <>
            {cart.map(({ productId, quantity }) => {
              const product = PRODUCTS.find((entry) => entry.id === productId);
              if (!product) return null;
              return (
                <View key={productId} style={styles.bagItem}>
                  <Image source={{ uri: product.image }} style={styles.bagImage} accessibilityLabel={product.alt} />
                  <View style={styles.bagDescription}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productColor}>{product.color}</Text>
                    <View style={styles.stepper}>
                      <Pressable accessibilityLabel={`Decrease ${product.name} quantity`} onPress={() => changeQuantity(productId, quantity - 1)} style={styles.stepperButton}>
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperCount}>{quantity}</Text>
                      <Pressable accessibilityLabel={`Increase ${product.name} quantity`} onPress={() => changeQuantity(productId, quantity + 1)} style={styles.stepperButton}>
                        <Text style={styles.stepperText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.bagPrice}>{money(product.priceKobo * quantity)}</Text>
                </View>
              );
            })}
            <Text style={styles.shippingNote}>
              {delivery ? `Add ${money(10_000_000 - subtotal)} for complimentary delivery.` : "Complimentary delivery on this order."}
            </Text>
            <View style={styles.summaryRow}><Text style={styles.bodyCopy}>Subtotal</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.bodyCopy}>Delivery</Text><Text style={styles.summaryValue}>{delivery ? money(delivery) : "Complimentary"}</Text></View>
            <View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalLabel}>{money(subtotal + delivery)}</Text></View>
            <ActionButton
              label={actionLoading ? "Preparing secure checkout…" : "Continue to secure checkout"}
              onPress={() => { checkout().catch(() => undefined); }}
              disabled={actionLoading}
            />
            <Text style={styles.checkoutNote}>Payment opens securely through Paystack. Your final total is checked by the shop.</Text>
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

export function AccountScreen() {
  const router = useRouter();
  const { actionLoading, authLoading, session, signIn, signInWithGoogle, signOut } = useShop();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await signIn(email, password);
      setPassword("");
      router.replace("/");
    } catch {
      // The provider displays the authentication error in the shared notice.
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch {
      // The provider displays the OAuth error in the shared notice.
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <ScreenFrame><ActivityIndicator color={colors.olive} style={styles.loading} /></ScreenFrame>;
  }

  return (
    <ScreenFrame>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>A PLACE OF YOUR OWN</Text>
          <Text style={styles.pageTitle}>{session ? "Your account." : "Welcome back."}</Text>
          {session ? (
            <View style={styles.accountCard}>
              <Text style={styles.accountName}>{session.user.email}</Text>
              <Text style={styles.bodyCopy}>Your account and saved bag are shared with the Atelier June website.</Text>
              <ActionButton
                label={actionLoading ? "Signing out…" : "Sign out"}
                onPress={() => { signOut().catch(() => undefined); }}
                secondary
                disabled={actionLoading}
              />
            </View>
          ) : (
            <View style={styles.loginCard}>
              <Text style={styles.bodyCopy}>Sign in with the same email and password you use on the website. Your account and bag stay in sync.</Text>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={email}
              />
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                onChangeText={setPassword}
                onSubmitEditing={submit}
                placeholder="Your website password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
              <ActionButton
                label={submitting ? "Signing in…" : "Sign in to your account"}
                onPress={() => { submit().catch(() => undefined); }}
                disabled={submitting || !email || !password}
              />
              <View style={styles.orDivider}><View style={styles.dividerLine} /><Text style={styles.orText}>OR</Text><View style={styles.dividerLine} /></View>
              <ActionButton
                label={submitting || actionLoading ? "Connecting to Google…" : "Continue with Google"}
                onPress={() => { submitGoogle().catch(() => undefined); }}
                secondary
                disabled={submitting || actionLoading}
              />
              <Text style={styles.checkoutNote}>New to the studio? Create your account on the website, then sign in here.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  header: {
    height: 70,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { color: colors.ink, fontFamily: "Georgia", fontSize: 24, letterSpacing: -1.2 },
  wordmarkItalic: { color: colors.olive, fontStyle: "italic" },
  registered: { fontFamily: "System", fontSize: 9, verticalAlign: "top" },
  wordmarkCaption: { color: colors.muted, fontSize: 8, letterSpacing: 2.1 },
  bagShortcut: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.line },
  bagShortcutText: { color: colors.ink, fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  bagShortcutCount: { color: colors.olive },
  notice: {
    marginHorizontal: 18,
    marginTop: 10,
    padding: 11,
    backgroundColor: "#e9ebdf",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  noticeError: { backgroundColor: "#f5e7df" },
  noticeText: { color: colors.olive, flex: 1, fontSize: 12, lineHeight: 17 },
  noticeTextError: { color: colors.rust },
  retryText: { color: colors.rust, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  dismissText: { color: colors.olive, fontSize: 18, paddingHorizontal: 5 },
  shopContent: { paddingBottom: 24 },
  hero: {
    minHeight: 278,
    backgroundColor: colors.olive,
    marginHorizontal: 14,
    marginTop: 14,
    padding: 22,
    paddingTop: 24,
    overflow: "hidden",
    justifyContent: "center",
  },
  heroKicker: { color: "#dbd9c8", fontSize: 9, fontWeight: "600", letterSpacing: 1.4 },
  heroTitle: { color: colors.white, fontFamily: "Georgia", fontSize: 51, lineHeight: 52, marginTop: 18, letterSpacing: -1.4 },
  heroItalic: { color: "#d4bd91", fontStyle: "italic" },
  heroIntro: { color: "#e6e5da", fontSize: 13, lineHeight: 20, maxWidth: "78%", marginTop: 12 },
  heroFoot: { color: "#d6d5c5", fontSize: 8, letterSpacing: 1.2, marginTop: 24 },
  heroStamp: {
    position: "absolute",
    right: -22,
    top: 36,
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    borderColor: "#9ca48c",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "11deg" }],
  },
  heroStampText: { color: "#d6d5c5", fontSize: 9, lineHeight: 12, textAlign: "center", letterSpacing: 1 },
  collectionIntro: { marginTop: 27, marginHorizontal: 19, marginBottom: 14 },
  kicker: { color: colors.olive, fontSize: 9, fontWeight: "700", letterSpacing: 1.7 },
  sectionTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 28, marginTop: 5, letterSpacing: -0.5 },
  categoryList: { paddingHorizontal: 18, gap: 8, paddingBottom: 16 },
  categoryChip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 9, paddingHorizontal: 13 },
  categoryChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  categoryText: { color: colors.ink, fontSize: 11 },
  categoryTextActive: { color: colors.white },
  productRow: { paddingHorizontal: 16, gap: 12, marginBottom: 19 },
  productCard: { flex: 1, backgroundColor: colors.card, minWidth: 0 },
  productImageWrap: { aspectRatio: 0.82, backgroundColor: "#e8e4d9", position: "relative" },
  productImage: { width: "100%", height: "100%" },
  productLabel: { position: "absolute", top: 9, left: 8, backgroundColor: colors.paper, color: colors.ink, paddingHorizontal: 7, paddingVertical: 5, fontSize: 7, fontWeight: "700", letterSpacing: 0.8 },
  productDetails: { padding: 10 },
  productName: { color: colors.ink, fontFamily: "Georgia", fontSize: 14, lineHeight: 18 },
  productPrice: { color: colors.ink, fontSize: 10, fontWeight: "600", marginTop: 4 },
  productColor: { color: colors.muted, fontSize: 10, marginTop: 4 },
  addButton: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 10, paddingTop: 9 },
  addButtonText: { color: colors.olive, fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  pressed: { opacity: 0.55 },
  pageContent: { paddingHorizontal: 21, paddingTop: 28, paddingBottom: 30 },
  pageTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 42, letterSpacing: -1, marginTop: 5, marginBottom: 25 },
  emptyBag: { minHeight: 300, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, gap: 12 },
  emptyMark: { color: colors.olive, fontSize: 30 },
  emptyTitle: { color: colors.ink, fontFamily: "Georgia", fontSize: 23, lineHeight: 29, textAlign: "center" },
  bodyCopy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  actionButton: { backgroundColor: colors.ink, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, marginTop: 15 },
  actionButtonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.olive },
  actionButtonText: { color: colors.white, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  actionButtonTextSecondary: { color: colors.olive },
  buttonDisabled: { opacity: 0.48 },
  bagItem: { flexDirection: "row", gap: 13, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line },
  bagImage: { width: 84, height: 102, backgroundColor: "#e8e4d9" },
  bagDescription: { flex: 1, paddingVertical: 4 },
  bagPrice: { color: colors.ink, fontSize: 11, fontWeight: "600", paddingTop: 5 },
  stepper: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, borderColor: colors.line, marginTop: 12 },
  stepperButton: { width: 30, height: 29, alignItems: "center", justifyContent: "center" },
  stepperText: { color: colors.ink, fontSize: 16 },
  stepperCount: { color: colors.ink, fontSize: 11, minWidth: 22, textAlign: "center" },
  shippingNote: { color: colors.olive, fontSize: 11, lineHeight: 17, marginVertical: 17 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  summaryValue: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  totalRow: { borderTopWidth: 1, borderColor: colors.line, marginTop: 5, paddingTop: 13 },
  totalLabel: { color: colors.ink, fontFamily: "Georgia", fontSize: 16 },
  checkoutNote: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 12 },
  loading: { marginTop: 44 },
  accountCard: { backgroundColor: colors.card, padding: 18, gap: 12 },
  accountName: { color: colors.ink, fontFamily: "Georgia", fontSize: 19 },
  loginCard: { backgroundColor: colors.card, padding: 18 },
  orDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.muted, fontSize: 8, letterSpacing: 1.3 },
  inputLabel: { color: colors.olive, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginTop: 22, marginBottom: 7 },
  input: { minHeight: 48, borderBottomWidth: 1, borderColor: colors.line, color: colors.ink, fontSize: 14, paddingHorizontal: 2 },
});
