# Lo que la página llama desde JavaScript (window.ZenAndroid)
-keepclassmembers class com.luckicla.zenchat.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
