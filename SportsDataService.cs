using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

public class SportsDataService
{
    private readonly HttpClient _httpClient;
    private const string ApiSportsKey = "YOUR_API_SPORTS_KEY";
    private const string OddsApiKey = "YOUR_THE_ODDS_API_KEY";

    public SportsDataService(HttpClient httpClient)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    }

    /// <summary>
    /// Fetches team metrics and computes normalized attack/defense values for the Poisson model.
    /// </summary>
    public async Task<PoissonPayloadDto> GetPoissonDataAsync(string leagueId, string homeTeamId, string awayTeamId)
    {
        _httpClient.DefaultRequestHeaders.Clear();
        _httpClient.DefaultRequestHeaders.Add("x-apisports-key", ApiSportsKey);

        // Example API-Sports fetch for league/team metrics.
        // Replace with your exact provider endpoint and response schema.
        var requestUri = $"https://v3.football.api-sports.io/teams/statistics?league={leagueId}&season=2026&team={homeTeamId}";
        var response = await _httpClient.GetAsync(requestUri);
        response.EnsureSuccessStatusCode();

        var jsonString = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(jsonString);
        var root = doc.RootElement;

        var homeScoredAvg = root
            .GetProperty("response")
            .GetProperty("goals")
            .GetProperty("for")
            .GetProperty("average")
            .GetProperty("home")
            .GetDouble();

        var homeConcededAvg = root
            .GetProperty("response")
            .GetProperty("goals")
            .GetProperty("against")
            .GetProperty("average")
            .GetProperty("home")
            .GetDouble();

        // League baselines used for model normalization.
        const double leagueHomeAvgScored = 1.52;
        const double leagueAwayAvgScored = 1.21;

        var homeAttackStrength = homeScoredAvg / leagueHomeAvgScored;
        var awayDefenseStrength = homeConcededAvg / leagueAwayAvgScored;

        return new PoissonPayloadDto
        {
            Sport = "EPL",
            EventName = "Arsenal vs Chelsea",
            HomeAttackStrength = Math.Round(homeAttackStrength, 2),
            AwayDefenseStrength = Math.Round(awayDefenseStrength, 2),
            TargetOddsMin = 1.40,
            TargetOddsMax = 1.50
        };
    }
}

public class PoissonPayloadDto
{
    public string Sport { get; set; } = string.Empty;
    public string EventName { get; set; } = string.Empty;
    public double HomeAttackStrength { get; set; }
    public double AwayDefenseStrength { get; set; }
    public double TargetOddsMin { get; set; }
    public double TargetOddsMax { get; set; }
}
